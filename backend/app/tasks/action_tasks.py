"""Celery tasks for Actions execution, scheduling, and periodic syncs.

Architecture:
- execute_action: run a single Action's steps (send message, create note, etc.)
  Retries up to 3× with exponential backoff; on final failure the action is
  archived into `failed_actions` (dead-letter collection).
- actions_scheduler (periodic, 1 min): pops actions whose next_run <= now and
  enqueues execute_action for each.
- follow_up_checker (periodic, 1 h): evaluates trigger.event=="no_reply" for
  all active actions; if contact has no inbound reply for N days, enqueue.
- sync_contacts_all (periodic, 15 min): refresh contact data from connected
  platforms (currently Telegram).

Motor/async is used throughout; each task wraps its coroutine in asyncio.run.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from bson import ObjectId
from croniter import croniter

from app.core.database import close_db, connect_db, get_db
from app.tasks.celery_app import celery_app

log = logging.getLogger(__name__)


def _run(coro):
    """Run a coroutine in a fresh event loop (Celery workers are sync)."""
    async def _wrapped():
        await connect_db()
        try:
            return await coro
        finally:
            await close_db()
    return asyncio.run(_wrapped())


# ─── Step dispatchers ────────────────────────────────────────────────

async def _step_send_message(db, action, step):
    """Send a message to the action's target contact via Unipile.

    Dispatch by platform kind:
      - chat platforms (telegram/linkedin/instagram/whatsapp): use the contact's
        Unipile chat_id to post a message.
      - email (gmail/outlook): find the contact's Unipile email-account linkage
        and send through the email endpoint.
    """
    from app.services import unipile_service

    contact_id = action.get("contact_id")
    if not contact_id:
        raise ValueError("send_message step requires action.contact_id")

    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": action["owner_id"]})
    if not contact:
        raise ValueError(f"Contact {contact_id} not found")

    platform = (step.get("platform") or "").lower()
    content = step.get("content", "")
    if not content:
        raise ValueError("send_message step requires content")

    chat_platforms = {"telegram", "linkedin", "instagram", "whatsapp"}
    email_platforms = {"gmail", "google_oauth", "outlook", "email"}

    external_id = ""

    if platform in chat_platforms or not platform:
        # Prefer a chat_id matching platform; fall back to any chat platform.
        plat = next(
            (p for p in contact.get("platforms", [])
             if p.get("chat_id") and (not platform or p.get("type") == platform)),
            None,
        ) or next(
            (p for p in contact.get("platforms", []) if p.get("chat_id")),
            None,
        )
        if not plat:
            raise ValueError("Contact has no Unipile chat — cannot send message")
        result = await unipile_service.send_message(chat_id=plat["chat_id"], text=content)
        external_id = str(result.get("id") or result.get("message_id") or "")
        platform = plat.get("type", platform)

    elif platform in email_platforms:
        email_addr = contact.get("email") or next(
            (p.get("profile_id") for p in contact.get("platforms", [])
             if "@" in (p.get("profile_id") or "")),
            "",
        )
        if not email_addr:
            raise ValueError("Contact has no email address")
        email_plat = next(
            (p for p in contact.get("platforms", [])
             if (p.get("type") or "").lower() in email_platforms and p.get("account_id")),
            None,
        )
        if not email_plat:
            raise ValueError("Contact has no email Unipile account linkage")
        subject = step.get("subject") or f"From {action.get('name', 'Pavutyna Action')}"
        result = await unipile_service.send_email(
            account_id=email_plat["account_id"],
            to=[email_addr],
            subject=subject,
            body=content,
        )
        external_id = str(result.get("id") or result.get("message_id") or "")

    else:
        raise ValueError(f"Unsupported platform: {platform}")

    now = datetime.utcnow()
    await db.messages.insert_one({
        "owner_id": action["owner_id"],
        "contact_id": contact_id,
        "platform": platform,
        "direction": "outbound",
        "content": content,
        "subject": step.get("subject", ""),
        "media_urls": [],
        "external_id": external_id,
        "read": True,
        "sent_at": now,
        "created_at": now,
        "from_action_id": str(action["_id"]),
    })
    return {"platform": platform, "external_id": external_id}


async def _step_create_note(db, action, step):
    """Attach a note page to the contact."""
    contact_id = action.get("contact_id")
    if not contact_id:
        raise ValueError("create_note step requires action.contact_id")

    now = datetime.utcnow()
    await db.pages.insert_one({
        "owner_id": action["owner_id"],
        "contact_id": contact_id,
        "title": f"Note from {action.get('name', 'Action')}",
        "content": step.get("content", ""),
        "created_at": now,
        "updated_at": now,
    })
    return {"ok": True}


async def _step_add_reminder(db, action, step):
    """Create a notification for the user."""
    await db.notifications.insert_one({
        "owner_id": action["owner_id"],
        "type": "action_completed",
        "title": action.get("name", "Reminder"),
        "body": step.get("content", ""),
        "contact_id": action.get("contact_id"),
        "read": False,
        "platform": "",
        "created_at": datetime.utcnow(),
    })
    # Push to WS so badge/toast update live
    from app.services.realtime import publish_event
    await publish_event(action["owner_id"], "notification", {
        "title": action.get("name", "Reminder"),
        "body": step.get("content", ""),
    })
    return {"ok": True}


_STEP_DISPATCH = {
    "send_message": _step_send_message,
    "create_note": _step_create_note,
    "add_reminder": _step_add_reminder,
}


# ─── Core execution ──────────────────────────────────────────────────

def _is_exhausted(action: dict, now: datetime) -> tuple[bool, str]:
    """Return (True, reason) if the action should stop, else (False, '')."""
    end_date = action.get("end_date")
    if end_date and end_date <= now:
        return True, "end_date reached"
    max_runs = action.get("max_runs")
    if max_runs and action.get("run_count", 0) >= max_runs:
        return True, "max_runs reached"
    return False, ""


async def _execute_action_async(action_id: str) -> dict:
    db = get_db()
    action = await db.actions.find_one({"_id": ObjectId(action_id)})
    if not action:
        return {"error": f"Action {action_id} not found"}

    if action.get("status") != "active":
        return {"skipped": True, "reason": f"status={action.get('status')}"}

    # Refuse to run if stop conditions are already satisfied. Also flip
    # status so the scheduler stops picking it up.
    exhausted, reason = _is_exhausted(action, datetime.utcnow())
    if exhausted:
        await db.actions.update_one(
            {"_id": action["_id"]}, {"$set": {"status": "completed", "next_run": None}}
        )
        return {"skipped": True, "reason": reason}

    results = []
    steps = sorted(action.get("steps", []), key=lambda s: s.get("order", 0))

    for step in steps:
        step_type = step.get("type")
        handler = _STEP_DISPATCH.get(step_type)
        if not handler:
            raise ValueError(f"Unknown step type: {step_type}")

        # Honor per-step delay (in minutes).
        delay = step.get("delay_minutes", 0)
        if delay:
            await asyncio.sleep(delay * 60)

        result = await handler(db, action, step)
        results.append({"type": step_type, "result": result})

    now = datetime.utcnow()
    new_run_count = action.get("run_count", 0) + 1

    # Compute next_run for recurring schedule triggers.
    next_run = None
    trigger = action.get("trigger") or {}
    if trigger.get("type") == "schedule" and trigger.get("cron"):
        try:
            next_run = croniter(trigger["cron"], now).get_next(datetime)
        except Exception:
            pass

    update: dict = {"last_run": now, "run_count": new_run_count}

    # Stop conditions after this run? Mark completed.
    max_runs = action.get("max_runs")
    end_date = action.get("end_date")
    hit_max = max_runs and new_run_count >= max_runs
    hit_end = end_date and next_run and next_run >= end_date
    hit_end_now = end_date and end_date <= now

    if hit_max or hit_end or hit_end_now:
        update["status"] = "completed"
        update["next_run"] = None
    elif next_run:
        update["next_run"] = next_run
    else:
        # One-shot (manual trigger or non-recurring schedule) — mark completed
        # unless it's an event-driven trigger which stays active.
        if trigger.get("type") != "event":
            update["status"] = "completed"

    await db.actions.update_one({"_id": action["_id"]}, {"$set": update})
    return {"action_id": action_id, "steps": results}


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def execute_action(self, action_id: str):
    """Execute a single Action's steps. Retries on failure; DLQ on final fail."""
    try:
        result = _run(_execute_action_async(action_id))
        log.info(f"Action {action_id} executed: {result}")
        return result
    except Exception as exc:
        log.exception(f"Action {action_id} failed (attempt {self.request.retries + 1})")
        if self.request.retries >= self.max_retries:
            # Final failure — archive to dead-letter collection.
            _run(_archive_failed(action_id, str(exc), self.request.retries + 1))
            return {"action_id": action_id, "status": "failed", "error": str(exc)}
        # Exponential backoff: 30s, 120s, 480s.
        raise self.retry(exc=exc, countdown=30 * (4 ** self.request.retries))


async def _archive_failed(action_id: str, error: str, attempts: int):
    db = get_db()
    action = await db.actions.find_one({"_id": ObjectId(action_id)})
    if not action:
        return
    await db.failed_actions.insert_one({
        "action_id": action_id,
        "owner_id": action.get("owner_id"),
        "snapshot": {
            "name": action.get("name"),
            "steps": action.get("steps"),
            "trigger": action.get("trigger"),
        },
        "error": error,
        "attempts": attempts,
        "failed_at": datetime.utcnow(),
    })
    await db.actions.update_one({"_id": action["_id"]}, {"$set": {"status": "error"}})


# ─── Periodic: actions scheduler ─────────────────────────────────────

async def _scheduler_tick():
    db = get_db()
    now = datetime.utcnow()

    # Find due scheduled actions (next_run <= now OR first-time scheduled without next_run).
    cursor = db.actions.find({
        "status": "active",
        "trigger.type": "schedule",
        "$or": [
            {"next_run": {"$lte": now}},
            {"next_run": None, "last_run": None},
        ],
    })

    count = 0
    async for action in cursor:
        # Auto-complete actions that hit their stop conditions between runs.
        exhausted, _ = _is_exhausted(action, now)
        if exhausted:
            await db.actions.update_one(
                {"_id": action["_id"]}, {"$set": {"status": "completed", "next_run": None}}
            )
            continue

        # If next_run is missing and we have a cron, compute it now rather
        # than firing immediately — avoids runaway execution on first boot.
        cron = (action.get("trigger") or {}).get("cron")
        if cron and action.get("next_run") is None:
            try:
                next_run = croniter(cron, now).get_next(datetime)
                await db.actions.update_one(
                    {"_id": action["_id"]}, {"$set": {"next_run": next_run}}
                )
                continue
            except Exception:
                pass
        execute_action.delay(str(action["_id"]))
        count += 1
    return count


@celery_app.task
def actions_scheduler():
    """Every minute: enqueue actions whose next_run has arrived."""
    n = _run(_scheduler_tick())
    if n:
        log.info(f"actions_scheduler: enqueued {n} action(s)")
    return {"enqueued": n}


# ─── Periodic: follow-up checker ─────────────────────────────────────

async def _follow_up_tick():
    db = get_db()
    now = datetime.utcnow()
    count = 0

    cursor = db.actions.find({
        "status": "active",
        "trigger.type": "event",
        "trigger.event": "no_reply",
    })

    async for action in cursor:
        contact_id = action.get("contact_id")
        if not contact_id:
            continue
        days = int((action.get("trigger") or {}).get("condition", {}).get("days", 7))
        threshold = now - timedelta(days=days)

        # Has the contact sent us anything since threshold?
        recent_inbound = await db.messages.find_one({
            "owner_id": action["owner_id"],
            "contact_id": contact_id,
            "direction": "inbound",
            "sent_at": {"$gte": threshold},
        })
        if recent_inbound:
            continue

        # Have we already followed up since the last inbound?
        last_outbound = await db.messages.find_one(
            {
                "owner_id": action["owner_id"],
                "contact_id": contact_id,
                "direction": "outbound",
                "from_action_id": str(action["_id"]),
            },
            sort=[("sent_at", -1)],
        )
        if last_outbound and last_outbound["sent_at"] >= threshold:
            continue

        execute_action.delay(str(action["_id"]))
        count += 1
    return count


@celery_app.task
def follow_up_checker():
    """Every hour: fire no_reply actions for contacts that went silent."""
    n = _run(_follow_up_tick())
    if n:
        log.info(f"follow_up_checker: enqueued {n} action(s)")
    return {"enqueued": n}


# ─── Periodic: contact sync ──────────────────────────────────────────

async def _sync_contacts_tick():
    """Refresh contact names from Unipile chats for every connected account.

    We iterate `/chats` for each account — the chat.name field follows
    platform-side renames — and update matching contacts in bulk. Cheap
    enough to run every 15 min without rate-limit concerns.
    """
    from app.services import unipile_service

    db = get_db()
    updated = 0

    async for user in db.users.find({"integrations.unipile.accounts.0": {"$exists": True}}):
        user_id = str(user["_id"])
        accounts = user.get("integrations", {}).get("unipile", {}).get("accounts", []) or []
        for acc in accounts:
            account_id = acc.get("account_id")
            if not account_id:
                continue
            try:
                data = await unipile_service.list_chats(account_id=account_id, limit=200)
            except Exception as e:
                log.warning(f"Unipile list_chats failed for {account_id}: {e}")
                continue
            for chat in data.get("items", []):
                if chat.get("type") != 0:
                    continue
                chat_id = chat.get("id")
                name = chat.get("name") or ""
                if not chat_id or not name:
                    continue
                res = await db.contacts.update_one(
                    {"owner_id": user_id, "platforms.chat_id": chat_id, "name": {"$ne": name}},
                    {"$set": {"name": name}},
                )
                updated += res.modified_count
    return updated


@celery_app.task
def sync_contacts_all():
    """Every 15 minutes: refresh contact info from connected platforms."""
    n = _run(_sync_contacts_tick())
    log.info(f"sync_contacts_all: updated {n} contact(s)")
    return {"updated": n}


# ─── Backwards-compat: old per-platform signature ────────────────────

@celery_app.task
def sync_contacts(user_id: str, platform: str):
    """Legacy placeholder — kept so any queued jobs don't fail on deploy."""
    log.info(f"sync_contacts (legacy) called for {user_id}/{platform}")
    return {"user_id": user_id, "platform": platform, "status": "noop"}
