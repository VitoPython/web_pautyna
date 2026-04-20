"""Campaigns — multi-contact sequenced messaging.

A campaign contains an ordered list of steps (currently send_message only).
Leads (contacts added to the campaign) progress through the sequence with
configurable delays between steps. Execution is driven by a Celery beat task
that fires every minute.
"""

from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.campaign import CampaignCreate, CampaignUpdate, LeadAdd

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


def _as_out(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


async def _aggregate_stats(db, campaign_id: str) -> dict:
    """Total leads + per-status counts. Cheap enough to compute on every read."""
    pipeline = [
        {"$match": {"campaign_id": campaign_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    buckets = {d["_id"]: d["count"] for d in await db.campaign_leads.aggregate(pipeline).to_list(50)}
    total = sum(buckets.values())
    return {
        "total": total,
        "pending": buckets.get("pending", 0),
        "in_progress": buckets.get("in_progress", 0),
        "replied": buckets.get("replied", 0),
        "done": buckets.get("done", 0),
        "error": buckets.get("error", 0),
    }


@router.get("")
async def list_campaigns(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    items = await db.campaigns.find({"owner_id": user_id}).sort("created_at", -1).to_list(200)
    out = []
    for doc in items:
        stats = await _aggregate_stats(db, str(doc["_id"]))
        out.append({**_as_out(doc), "stats": stats})
    return out


@router.post("", status_code=201)
async def create_campaign(data: CampaignCreate, user_id: str = Depends(get_current_user_id)):
    if not data.name.strip():
        raise HTTPException(status_code=422, detail="Назва обов'язкова")
    now = datetime.utcnow()
    doc = {
        "owner_id": user_id,
        "name": data.name.strip(),
        "description": data.description.strip(),
        "status": "draft",
        "steps": [s.model_dump() for s in data.steps],
        "created_at": now,
        "updated_at": now,
    }
    db = get_db()
    res = await db.campaigns.insert_one(doc)
    doc["_id"] = res.inserted_id
    return {**_as_out(doc), "stats": {"total": 0, "pending": 0, "in_progress": 0, "replied": 0, "done": 0, "error": 0}}


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    doc = await db.campaigns.find_one({"_id": ObjectId(campaign_id), "owner_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    stats = await _aggregate_stats(db, campaign_id)
    return {**_as_out(doc), "stats": stats}


@router.patch("/{campaign_id}")
async def update_campaign(campaign_id: str, data: CampaignUpdate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    existing = await db.campaigns.find_one({"_id": ObjectId(campaign_id), "owner_id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Campaign not found")

    now = datetime.utcnow()
    updates: dict = {"updated_at": now}
    if data.name is not None:
        updates["name"] = data.name.strip()
    if data.description is not None:
        updates["description"] = data.description.strip()
    if data.status is not None:
        if data.status not in {"draft", "active", "paused", "done"}:
            raise HTTPException(status_code=422, detail="Invalid status")
        updates["status"] = data.status
    if data.steps is not None:
        updates["steps"] = [s.model_dump() for s in data.steps]

    await db.campaigns.update_one({"_id": existing["_id"]}, {"$set": updates})

    # Transitioning to "active" — wake up leads that were queued while draft/paused.
    # Set next_action_at = now + the lead's current step's delay_minutes so the
    # first step honors its "start delay" instead of firing immediately.
    if data.status == "active" and existing.get("status") != "active":
        steps = data.steps and [s.model_dump() for s in data.steps] or existing.get("steps") or []
        async for lead in db.campaign_leads.find({
            "campaign_id": campaign_id,
            "status": {"$in": ["pending", "in_progress"]},
            "next_action_at": None,
        }):
            idx = int(lead.get("current_step") or 0)
            delay = int((steps[idx] if idx < len(steps) else {}).get("delay_minutes", 0) or 0)
            await db.campaign_leads.update_one(
                {"_id": lead["_id"]},
                {"$set": {"next_action_at": now + timedelta(minutes=delay)}},
            )

    return {"ok": True}


@router.delete("/{campaign_id}")
async def delete_campaign(campaign_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    res = await db.campaigns.delete_one({"_id": ObjectId(campaign_id), "owner_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await db.campaign_leads.delete_many({"campaign_id": campaign_id})
    return {"ok": True}


# ─── Leads ────────────────────────────────────────────────────────────

@router.get("/{campaign_id}/leads")
async def list_leads(campaign_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    campaign = await db.campaigns.find_one({"_id": ObjectId(campaign_id), "owner_id": user_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    leads = await db.campaign_leads.find({"campaign_id": campaign_id}).sort("added_at", -1).to_list(500)
    contact_ids = [ObjectId(l["contact_id"]) for l in leads if l.get("contact_id")]
    contacts_by_id = {
        str(c["_id"]): c
        for c in await db.contacts.find({"_id": {"$in": contact_ids}, "owner_id": user_id}).to_list(len(contact_ids))
    }

    out = []
    for lead in leads:
        lead["_id"] = str(lead["_id"])
        contact = contacts_by_id.get(lead["contact_id"], {})
        out.append({
            **lead,
            "contact_name": contact.get("name", ""),
            "contact_avatar": contact.get("avatar_url", ""),
            "contact_email": contact.get("email", ""),
            "contact_company": contact.get("company", ""),
            "contact_job_title": contact.get("job_title", ""),
        })
    return out


@router.post("/{campaign_id}/leads", status_code=201)
async def add_leads(campaign_id: str, data: LeadAdd, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    campaign = await db.campaigns.find_one({"_id": ObjectId(campaign_id), "owner_id": user_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Filter out contact_ids that don't belong to this user or are already in the campaign.
    valid_ids = [
        str(c["_id"])
        for c in await db.contacts.find(
            {"_id": {"$in": [ObjectId(cid) for cid in data.contact_ids if cid]}, "owner_id": user_id},
            {"_id": 1},
        ).to_list(len(data.contact_ids))
    ]
    existing = {
        l["contact_id"]
        for l in await db.campaign_leads.find(
            {"campaign_id": campaign_id, "contact_id": {"$in": valid_ids}},
            {"contact_id": 1},
        ).to_list(len(valid_ids))
    }
    new_ids = [cid for cid in valid_ids if cid not in existing]
    if not new_ids:
        return {"added": 0, "skipped": len(data.contact_ids)}

    now = datetime.utcnow()
    # Honor step 0's delay when inserting into an active campaign. For drafts
    # we stamp null and let the PATCH→active transition compute the delay then.
    first_step = (campaign.get("steps") or [{}])[0] if campaign.get("steps") else {}
    first_delay = int((first_step or {}).get("delay_minutes", 0) or 0)
    initial_next = (now + timedelta(minutes=first_delay)) if campaign.get("status") == "active" else None

    docs = [
        {
            "campaign_id": campaign_id,
            "owner_id": user_id,
            "contact_id": cid,
            "status": "pending",
            "current_step": 0,
            "next_action_at": initial_next,
            "last_action_at": None,
            "error": "",
            "added_at": now,
        }
        for cid in new_ids
    ]
    await db.campaign_leads.insert_many(docs)
    return {"added": len(new_ids), "skipped": len(data.contact_ids) - len(new_ids)}


@router.delete("/{campaign_id}/leads/{lead_id}")
async def remove_lead(campaign_id: str, lead_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    res = await db.campaign_leads.delete_one({
        "_id": ObjectId(lead_id),
        "campaign_id": campaign_id,
        "owner_id": user_id,
    })
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"ok": True}
