"""Cross-cutting helper: when a contact sends us a message, any campaign
leads for that contact should flip to `replied` so the scheduler stops
sending further steps and the analytics tab reflects the reply.
"""

from __future__ import annotations

from datetime import datetime

from bson import ObjectId


async def maybe_complete_campaign(db, campaign_id: str) -> bool:
    """Flip an active campaign to `done` when every lead is in a terminal
    state (replied/done/error) and the campaign has at least one lead.
    Returns True if it flipped, False otherwise.
    """
    campaign = await db.campaigns.find_one({"_id": ObjectId(campaign_id)})
    if not campaign or campaign.get("status") != "active":
        return False
    total = await db.campaign_leads.count_documents({"campaign_id": campaign_id})
    if total == 0:
        return False
    unfinished = await db.campaign_leads.count_documents({
        "campaign_id": campaign_id,
        "status": {"$in": ["pending", "in_progress"]},
    })
    if unfinished > 0:
        return False
    await db.campaigns.update_one(
        {"_id": campaign["_id"]},
        {"$set": {"status": "done", "updated_at": datetime.utcnow()}},
    )
    try:
        from app.services.realtime import publish_event
        await publish_event(campaign.get("owner_id", ""), "campaign_updated", {"campaign_id": campaign_id})
    except Exception:
        pass
    return True


async def mark_campaign_replies(db, user_id: str, contact_id: str) -> int:
    """Transition pending/in_progress/done leads for this contact → `replied`.

    Returns the number of leads updated. Called from every inbound message
    insertion path (webhooks.py, messages.py chat sync, messages.py email sync).
    Also pushes a WS event so the open /campaigns/[id] page re-fetches stats.
    """
    # Collect affected campaign ids BEFORE updating so we can notify per-campaign.
    affected = await db.campaign_leads.find(
        {
            "owner_id": user_id,
            "contact_id": contact_id,
            "status": {"$in": ["pending", "in_progress", "done"]},
        },
        {"campaign_id": 1},
    ).to_list(50)

    if not affected:
        return 0

    res = await db.campaign_leads.update_many(
        {
            "owner_id": user_id,
            "contact_id": contact_id,
            "status": {"$in": ["pending", "in_progress", "done"]},
        },
        {"$set": {"status": "replied", "next_action_at": None}},
    )

    from app.services.realtime import publish_event
    seen = set()
    for lead in affected:
        cid = lead.get("campaign_id")
        if cid and cid not in seen:
            seen.add(cid)
            # Reply may have been the final hold-out — try to auto-complete.
            await maybe_complete_campaign(db, cid)
            await publish_event(user_id, "campaign_updated", {"campaign_id": cid})
    return res.modified_count
