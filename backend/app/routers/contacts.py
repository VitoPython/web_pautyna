import base64
import uuid

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.contact import ContactCreate, ContactUpdate

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("")
async def list_contacts(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    contacts = await db.contacts.find({"owner_id": user_id}).to_list(1000)
    for c in contacts:
        c["_id"] = str(c["_id"])
    return contacts


@router.post("", status_code=201)
async def create_contact(data: ContactCreate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    doc = {
        "owner_id": user_id,
        **data.model_dump(),
    }
    result = await db.contacts.insert_one(doc)

    canvas = await db.canvases.find_one({"owner_id": user_id})
    if canvas:
        await db.canvases.update_one(
            {"_id": canvas["_id"]},
            {"$push": {"nodes": {
                "contact_id": str(result.inserted_id),
                "x": data.position.x,
                "y": data.position.y,
                "is_center": False,
            }}},
        )

    return {"id": str(result.inserted_id)}


@router.get("/{contact_id}")
async def get_contact(contact_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    contact["_id"] = str(contact["_id"])
    return contact


@router.patch("/{contact_id}")
async def update_contact(contact_id: str, data: ContactUpdate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    update = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.contacts.update_one(
        {"_id": ObjectId(contact_id), "owner_id": user_id},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"ok": True}


@router.delete("/{contact_id}")
async def delete_contact(contact_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    result = await db.contacts.delete_one({"_id": ObjectId(contact_id), "owner_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")

    canvas = await db.canvases.find_one({"owner_id": user_id})
    if canvas:
        await db.canvases.update_one(
            {"_id": canvas["_id"]},
            {"$pull": {"nodes": {"contact_id": contact_id}}},
        )
    return {"ok": True}


@router.post("/{contact_id}/avatar")
async def upload_avatar(
    contact_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Upload avatar image for a contact. Stored as base64 data URI in MongoDB."""
    db = get_db()
    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Файл має бути зображенням")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:  # 2MB limit
        raise HTTPException(status_code=400, detail="Файл занадто великий (макс 2MB)")

    b64 = base64.b64encode(content).decode("utf-8")
    avatar_url = f"data:{file.content_type};base64,{b64}"

    await db.contacts.update_one(
        {"_id": ObjectId(contact_id)},
        {"$set": {"avatar_url": avatar_url}},
    )

    return {"avatar_url": avatar_url}
