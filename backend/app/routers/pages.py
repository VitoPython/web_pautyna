from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.page import PageCreate, PageUpdate

router = APIRouter(prefix="/pages", tags=["pages"])


@router.get("/{page_id}")
async def get_page(page_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    page = await db.pages.find_one({"_id": ObjectId(page_id), "owner_id": user_id})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    page["_id"] = str(page["_id"])
    return page


@router.post("", status_code=201)
async def create_page(data: PageCreate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    doc = {"owner_id": user_id, **data.model_dump(), "blocks": []}
    result = await db.pages.insert_one(doc)
    page_id = str(result.inserted_id)

    # Link page to contact if specified
    if data.contact_id:
        await db.contacts.update_one(
            {"_id": ObjectId(data.contact_id), "owner_id": user_id},
            {"$set": {"note_page_id": page_id}},
        )

    # Link to parent page if specified
    if data.parent_page_id:
        await db.pages.update_one(
            {"_id": ObjectId(data.parent_page_id)},
            {"$push": {"sub_pages": page_id}},
        )

    return {"id": page_id}


@router.patch("/{page_id}")
async def update_page(page_id: str, data: PageUpdate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    update = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if "blocks" in update:
        update["blocks"] = [b.model_dump() if hasattr(b, "model_dump") else b for b in update["blocks"]]
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.pages.update_one(
        {"_id": ObjectId(page_id), "owner_id": user_id},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"ok": True}


@router.delete("/{page_id}")
async def delete_page(page_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    result = await db.pages.delete_one({"_id": ObjectId(page_id), "owner_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"ok": True}
