"""Cross-cutting helper: when a contact sends us a message, any campaign
leads for that contact should flip to `replied` so the scheduler stops
sending further steps and the analytics tab reflects the reply.
"""

from __future__ import annotations


async def mark_campaign_replies(db, user_id: str, contact_id: str) -> int:
    """Transition pending/in_progress/done leads for this contact → `replied`.

    Returns the number of leads updated. Called from every inbound message
    insertion path (webhooks.py, messages.py chat sync, messages.py email sync).
    """
    res = await db.campaign_leads.update_many(
        {
            "owner_id": user_id,
            "contact_id": contact_id,
            "status": {"$in": ["pending", "in_progress", "done"]},
        },
        {"$set": {"status": "replied", "next_action_at": None}},
    )
    return res.modified_count
