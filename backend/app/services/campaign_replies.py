"""Cross-cutting helper: when a contact sends us a message, any campaign
leads for that contact should flip to `replied` so the scheduler stops
sending further steps and the analytics tab reflects the reply.
"""

from __future__ import annotations


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
            await publish_event(user_id, "campaign_updated", {"campaign_id": cid})
    return res.modified_count
