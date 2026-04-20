"""Celery tasks for campaigns.

A campaign is a sequenced list of steps; each lead (contact in the campaign)
has its own `current_step` cursor and `next_action_at` timestamp. The
scheduler tick pulls due leads across all active campaigns and advances them
one step at a time. Delays between steps come from the step's `delay_minutes`
field.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from bson import ObjectId

from app.core.database import close_db, connect_db, get_db
from app.tasks.celery_app import celery_app

log = logging.getLogger(__name__)


def _run(coro):
    async def _wrapped():
        await connect_db()
        try:
            return await coro
        finally:
            await close_db()
    return asyncio.run(_wrapped())


async def _notify_campaign(user_id: str, campaign_id: str) -> None:
    """Push a WS event so the open campaign detail page re-fetches stats/leads."""
    try:
        from app.services.realtime import publish_event
        await publish_event(user_id, "campaign_updated", {"campaign_id": campaign_id})
    except Exception:
        # Best-effort — don't fail the tick on a notify hiccup.
        pass


async def _execute_step_for_lead(db, campaign: dict, lead: dict) -> None:
    """Run the lead's current step. Advances lead state regardless of outcome."""
    from app.services import unipile_service

    steps = sorted(campaign.get("steps") or [], key=lambda s: s.get("order", 0))
    idx = int(lead.get("current_step") or 0)
    if idx >= len(steps):
        # Already past last step — mark done.
        await db.campaign_leads.update_one(
            {"_id": lead["_id"]},
            {"$set": {"status": "done", "next_action_at": None}},
        )
        return

    step = steps[idx]
    contact = await db.contacts.find_one({
        "_id": ObjectId(lead["contact_id"]),
        "owner_id": lead["owner_id"],
    })
    if not contact:
        await db.campaign_leads.update_one(
            {"_id": lead["_id"]},
            {"$set": {"status": "error", "error": "Contact not found", "next_action_at": None}},
        )
        return

    now = datetime.utcnow()
    platform = (step.get("platform") or "").lower()
    content = step.get("content") or ""
    if not content:
        await db.campaign_leads.update_one(
            {"_id": lead["_id"]},
            {"$set": {"status": "error", "error": "Step has no content", "next_action_at": None}},
        )
        return

    chat_platforms = {"telegram", "linkedin", "instagram", "whatsapp"}
    email_platforms = {"gmail", "google_oauth", "outlook", "email"}

    try:
        external_id = ""

        # Pick the best platform entry matching the step's platform; fall back to any chat.
        if platform in chat_platforms or (not platform and any(p.get("chat_id") for p in contact.get("platforms", []))):
            plat = next(
                (p for p in contact.get("platforms", [])
                 if p.get("chat_id") and (not platform or p.get("type") == platform)),
                None,
            ) or next(
                (p for p in contact.get("platforms", []) if p.get("chat_id")),
                None,
            )
            if not plat:
                raise ValueError("Contact has no chat on a supported platform")
            result = await unipile_service.send_message(chat_id=plat["chat_id"], text=content)
            external_id = str(result.get("id") or result.get("message_id") or "")
            effective_platform = plat.get("type", platform or "")

        elif platform in email_platforms:
            email_addr = contact.get("email") or next(
                (p.get("profile_id") for p in contact.get("platforms", [])
                 if "@" in (p.get("profile_id") or "")),
                "",
            )
            email_plat = next(
                (p for p in contact.get("platforms", [])
                 if (p.get("type") or "").lower() in email_platforms and p.get("account_id")),
                None,
            )
            if not email_addr or not email_plat:
                raise ValueError("Contact has no email linkage")
            result = await unipile_service.send_email(
                account_id=email_plat["account_id"],
                to=[email_addr],
                subject=step.get("subject") or campaign.get("name") or "(без теми)",
                body=content,
            )
            external_id = str(result.get("id") or result.get("message_id") or "")
            effective_platform = email_plat.get("type", "")

        else:
            raise ValueError(f"Unsupported platform: {platform or 'auto'}")

        # Persist the outbound message so it shows up in inbox + history.
        await db.messages.insert_one({
            "owner_id": lead["owner_id"],
            "contact_id": lead["contact_id"],
            "platform": effective_platform,
            "direction": "outbound",
            "content": content,
            "subject": step.get("subject", ""),
            "media_urls": [],
            "external_id": external_id,
            "read": True,
            "sent_at": now,
            "created_at": now,
            "from_campaign_id": str(campaign["_id"]),
        })

        # Advance the lead: either to the next step (with delay) or to "done".
        next_idx = idx + 1
        if next_idx >= len(steps):
            await db.campaign_leads.update_one(
                {"_id": lead["_id"]},
                {"$set": {
                    "status": "done",
                    "current_step": next_idx,
                    "last_action_at": now,
                    "next_action_at": None,
                    "error": "",
                }},
            )
        else:
            next_delay = int(steps[next_idx].get("delay_minutes") or 0)
            next_at = now + timedelta(minutes=next_delay)
            await db.campaign_leads.update_one(
                {"_id": lead["_id"]},
                {"$set": {
                    "status": "in_progress",
                    "current_step": next_idx,
                    "last_action_at": now,
                    "next_action_at": next_at,
                    "error": "",
                }},
            )
    except Exception as e:
        log.warning(f"Campaign {campaign['_id']} lead {lead['_id']} step {idx} failed: {e}")
        await db.campaign_leads.update_one(
            {"_id": lead["_id"]},
            {"$set": {"status": "error", "error": str(e)[:300], "next_action_at": None}},
        )

    await _notify_campaign(lead["owner_id"], str(campaign["_id"]))


async def _backfill_replies(db) -> int:
    """Flip leads whose contact replied between ticks. Handles the case where
    an inbound message landed via a polling path that didn't run our reply hook,
    or predates the hook being deployed. Cheap: only looks at non-terminal leads.
    """
    count = 0
    cursor = db.campaign_leads.find({
        "status": {"$in": ["pending", "in_progress", "done"]},
        "last_action_at": {"$ne": None},
    })
    async for lead in cursor:
        reply = await db.messages.find_one({
            "owner_id": lead["owner_id"],
            "contact_id": lead["contact_id"],
            "direction": "inbound",
            "sent_at": {"$gt": lead["last_action_at"]},
        })
        if reply:
            await db.campaign_leads.update_one(
                {"_id": lead["_id"]},
                {"$set": {"status": "replied", "next_action_at": None}},
            )
            await _notify_campaign(lead["owner_id"], lead["campaign_id"])
            count += 1
    return count


async def _scheduler_tick():
    """Run due leads across all active campaigns."""
    db = get_db()
    now = datetime.utcnow()

    # First: flip any leads that replied since we last looked.
    await _backfill_replies(db)

    active_campaigns = {
        str(c["_id"]): c
        for c in await db.campaigns.find({"status": "active"}).to_list(500)
    }
    if not active_campaigns:
        return 0

    # Backfill: leads in active campaigns with null next_action_at get their
    # current step's delay applied. This covers any state that slipped past
    # the PATCH→active wake-up (e.g. leads added via an older code path).
    for cid, campaign in active_campaigns.items():
        steps = campaign.get("steps") or []
        async for lead in db.campaign_leads.find({
            "campaign_id": cid,
            "status": {"$in": ["pending", "in_progress"]},
            "next_action_at": None,
        }):
            idx = int(lead.get("current_step") or 0)
            delay = int((steps[idx] if idx < len(steps) else {}).get("delay_minutes", 0) or 0)
            await db.campaign_leads.update_one(
                {"_id": lead["_id"]},
                {"$set": {"next_action_at": now + timedelta(minutes=delay)}},
            )

    cursor = db.campaign_leads.find({
        "campaign_id": {"$in": list(active_campaigns.keys())},
        "status": {"$in": ["pending", "in_progress"]},
        "next_action_at": {"$lte": now},
    }).limit(200)

    processed = 0
    async for lead in cursor:
        campaign = active_campaigns.get(lead["campaign_id"])
        if not campaign:
            continue
        await _execute_step_for_lead(db, campaign, lead)
        processed += 1
    return processed


@celery_app.task
def campaigns_scheduler():
    n = _run(_scheduler_tick())
    if n:
        log.info(f"campaigns_scheduler: processed {n} lead(s)")
    return {"processed": n}
