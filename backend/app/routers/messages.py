from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.message import MessageSend

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("")
async def list_messages(
    contact_id: str | None = None,
    platform: str | None = None,
    user_id: str = Depends(get_current_user_id),
):
    db = get_db()
    query: dict = {"owner_id": user_id}
    if contact_id:
        query["contact_id"] = contact_id
    if platform:
        query["platform"] = platform
    messages = await db.messages.find(query).sort("sent_at", -1).to_list(200)
    for m in messages:
        m["_id"] = str(m["_id"])
    return messages


@router.post("/send", status_code=201)
async def send_message(data: MessageSend, user_id: str = Depends(get_current_user_id)):
    """Send a message through Unipile. Placeholder until Unipile integration."""
    db = get_db()
    doc = {
        "owner_id": user_id,
        "contact_id": data.contact_id,
        "platform": data.platform,
        "direction": "outbound",
        "content": data.content,
        "media_urls": [],
        "read": True,
    }
    result = await db.messages.insert_one(doc)
    return {"id": str(result.inserted_id)}


@router.patch("/{message_id}/read")
async def mark_read(message_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    result = await db.messages.update_one(
        {"_id": ObjectId(message_id), "owner_id": user_id},
        {"$set": {"read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"ok": True}
