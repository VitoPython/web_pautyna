from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.message import MessageSend

router = APIRouter(prefix="/messages", tags=["messages"])


@router.get("/chats")
async def list_chats(user_id: str = Depends(get_current_user_id)):
    """Get list of contacts that have messages, with last message preview + unread count."""
    db = get_db()

    # Aggregate: for each contact_id, get last message + unread count
    pipeline = [
        {"$match": {"owner_id": user_id}},
        {"$sort": {"sent_at": -1}},
        {
            "$group": {
                "_id": "$contact_id",
                "last_message": {"$first": "$$ROOT"},
                "unread_count": {
                    "$sum": {
                        "$cond": [
                            {"$and": [{"$eq": ["$read", False]}, {"$eq": ["$direction", "inbound"]}]},
                            1,
                            0,
                        ]
                    }
                },
                "total": {"$sum": 1},
            }
        },
        {"$sort": {"last_message.sent_at": -1}},
    ]

    chats_raw = await db.messages.aggregate(pipeline).to_list(500)

    chats = []
    for item in chats_raw:
        contact_id = item["_id"]
        if not contact_id:
            continue

        contact = None
        try:
            contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
        except Exception:
            pass

        if not contact:
            continue

        last = item["last_message"]
        chats.append({
            "contact_id": contact_id,
            "contact_name": contact.get("name", ""),
            "contact_avatar": contact.get("avatar_url", ""),
            "platform": last.get("platform", ""),
            "last_message": last.get("content", "")[:200],
            "last_direction": last.get("direction", ""),
            "last_sent_at": last.get("sent_at", last.get("created_at")),
            "unread_count": item["unread_count"],
            "total": item["total"],
        })

    return chats


@router.get("/contact/{contact_id}")
async def list_messages_by_contact(
    contact_id: str,
    limit: int = 100,
    user_id: str = Depends(get_current_user_id),
):
    """Get messages with a specific contact."""
    db = get_db()
    messages = await db.messages.find(
        {"owner_id": user_id, "contact_id": contact_id}
    ).sort("sent_at", 1).to_list(limit)

    for m in messages:
        m["_id"] = str(m["_id"])

    # Mark inbound as read
    await db.messages.update_many(
        {"owner_id": user_id, "contact_id": contact_id, "direction": "inbound", "read": False},
        {"$set": {"read": True}},
    )

    return messages


@router.post("/contact/{contact_id}/sync")
async def sync_contact_messages(contact_id: str, user_id: str = Depends(get_current_user_id)):
    """Fetch latest messages from Telegram/Gmail for this contact and save to DB."""
    db = get_db()
    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    synced = {"telegram": 0, "gmail": 0}

    tg_profile = next((p for p in contact.get("platforms", []) if p.get("type") == "telegram"), None)
    if tg_profile:
        try:
            from app.services import telegram_service
            msgs = await telegram_service.fetch_message_history(user_id, tg_profile["profile_id"])
            synced["telegram"] = len(msgs)
        except Exception:
            pass

    if contact.get("email"):
        try:
            from app.services import gmail_service
            msgs = await gmail_service.fetch_contact_messages(user_id, contact_id)
            synced["gmail"] = len(msgs)
        except Exception:
            pass

    return synced


@router.get("")
async def list_all_messages(
    platform: str | None = None,
    unread: bool = False,
    limit: int = 100,
    user_id: str = Depends(get_current_user_id),
):
    """List all messages (optional filters)."""
    db = get_db()
    query: dict = {"owner_id": user_id}
    if platform:
        query["platform"] = platform
    if unread:
        query["read"] = False
        query["direction"] = "inbound"

    messages = await db.messages.find(query).sort("sent_at", -1).to_list(limit)
    for m in messages:
        m["_id"] = str(m["_id"])
    return messages


@router.post("/send", status_code=201)
async def send_message(data: MessageSend, user_id: str = Depends(get_current_user_id)):
    """Send message to contact via their platform."""
    db = get_db()
    contact = await db.contacts.find_one({"_id": ObjectId(data.contact_id), "owner_id": user_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    now = datetime.utcnow()
    external_id = ""

    # Dispatch by platform
    if data.platform == "telegram":
        from app.services import telegram_service
        tg_profile = next(
            (p for p in contact.get("platforms", []) if p.get("type") == "telegram"),
            None,
        )
        if not tg_profile:
            raise HTTPException(status_code=400, detail="Контакт не має Telegram профілю")
        try:
            result = await telegram_service.send_message(
                user_id, tg_profile["profile_id"], data.content
            )
            external_id = str(result.get("message_id", ""))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Telegram: {e}")

    elif data.platform == "gmail":
        from app.services import gmail_service
        if not contact.get("email"):
            raise HTTPException(status_code=400, detail="Контакт не має email")
        try:
            result = await gmail_service.send_message(
                user_id, contact["email"], data.subject or "(без теми)", data.content
            )
            external_id = result.get("id", "")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Gmail: {e}")

    else:
        raise HTTPException(status_code=400, detail=f"Платформа {data.platform} поки не підтримується")

    # Save message to DB
    msg_doc = {
        "owner_id": user_id,
        "contact_id": data.contact_id,
        "platform": data.platform,
        "direction": "outbound",
        "content": data.content,
        "subject": data.subject,
        "media_urls": [],
        "external_id": external_id,
        "read": True,
        "sent_at": now,
        "created_at": now,
    }
    result = await db.messages.insert_one(msg_doc)

    return {"id": str(result.inserted_id), "external_id": external_id}


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


@router.post("/read-all")
async def mark_all_read(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    await db.messages.update_many(
        {"owner_id": user_id, "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True}
