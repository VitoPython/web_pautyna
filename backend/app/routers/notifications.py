from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user_id

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    notifications = await db.notifications.find({"owner_id": user_id}).sort("created_at", -1).to_list(100)
    for n in notifications:
        n["_id"] = str(n["_id"])
    return notifications


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    result = await db.notifications.update_one(
        {"_id": ObjectId(notification_id), "owner_id": user_id},
        {"$set": {"read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    await db.notifications.update_many(
        {"owner_id": user_id, "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True}
