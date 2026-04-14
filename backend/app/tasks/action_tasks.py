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
    """Send a message to the action's target contact via platform."""
    from app.services import gmail_service, telegram_service

    contact_id = action.get("contact_id")
    if not contact_id:
        raise ValueError("send_message step requires action.contact_id")

    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": action["owner_id"]})
    if not contact:
        raise ValueError(f"Contact {contact_id} not found")

    platform = step.get("platform") or "telegram"
    content = step.get("content", "")
    if not content:
        raise ValueError("send_message step requires content")

    external_id = ""
    if platform == "telegram":
        tg_profile = next(
            (p for p in contact.get("platforms", []) if p.get("type") == "telegram"),
            None,
        )
        if not tg_profile:
            raise ValueError("Contact has no Telegram profile")
        result = await telegram_service.send_message(action["owner_id"], tg_profile["profile_id"], content)
        external_id = str(result.get("message_id", ""))
    elif platform == "gmail":
        if not contact.get("email"):
            raise ValueError("Contact has no email")
        result = await gmail_service.send_message(
            action["owner_id"], contact["email"], "", content
        )
        external_id = result.get("id", "")
    else:
        raise ValueError(f"Unsupported platform: {platform}")

    now = datetime.utcnow()
    await db.messages.insert_one({
        "owner_id": action["owner_id"],
        "contact_id": contact_id,
        "platform": platform,
        "direction": "outbound",
        "content": content,
        "subject": "",
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

async def _execute_action_async(action_id: str) -> dict:
    db = get_db()
    action = await db.actions.find_one({"_id": ObjectId(action_id)})
    if not action:
        return {"error": f"Action {action_id} not found"}

    if action.get("status") != "active":
        return {"skipped": True, "reason": f"status={action.get('status')}"}

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

    # Compute next_run for recurring schedule triggers.
    next_run = None
    trigger = action.get("trigger") or {}
    if trigger.get("type") == "schedule" and trigger.get("cron"):
        try:
            next_run = croniter(trigger["cron"], datetime.utcnow()).get_next(datetime)
        except Exception:
            pass

    update = {
        "last_run": datetime.utcnow(),
        "run_count": action.get("run_count", 0) + 1,
    }
    if next_run:
        update["next_run"] = next_run
    else:
        update["status"] = "completed" if trigger.get("type") != "event" else action.get("status")

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
    """For every user with Telegram connected, refresh contact avatars/usernames.

    Intentionally lightweight — just updates names/usernames in bulk.
    Full message history sync is still on-demand via /messages/contact/{id}/sync.
    """
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.tl.functions.contacts import GetContactsRequest
    from telethon.tl.types import User as TgUser

    from app.core.config import settings

    db = get_db()
    updated = 0

    async for user in db.users.find({"integrations.telegram.connected": True}):
        session_str = user.get("integrations", {}).get("telegram", {}).get("session", "")
        if not session_str:
            continue

        client = TelegramClient(
            StringSession(session_str),
            settings.TELEGRAM_API_ID,
            settings.TELEGRAM_API_HASH,
            receive_updates=False,
        )
        try:
            await client.connect()
            if not await client.is_user_authorized():
                continue
            result = await client(GetContactsRequest(hash=0))
            for tg_user in result.users:
                if not isinstance(tg_user, TgUser) or tg_user.bot:
                    continue
                name = f"{tg_user.first_name or ''} {tg_user.last_name or ''}".strip()
                username = tg_user.username or ""
                res = await db.contacts.update_one(
                    {
                        "owner_id": str(user["_id"]),
                        "platforms.type": "telegram",
                        "platforms.profile_id": str(tg_user.id),
                    },
                    {"$set": {
                        "name": name,
                        "platforms.$.profile_url": f"https://t.me/{username}" if username else "",
                    }},
                )
                updated += res.modified_count
        except Exception as e:
            log.warning(f"sync_contacts failed for user {user['_id']}: {e}")
        finally:
            try:
                await client.disconnect()
            except Exception:
                pass

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
