from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.action import ActionCreate, ActionGenerate

router = APIRouter(prefix="/actions", tags=["actions"])


@router.get("")
async def list_actions(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    actions = await db.actions.find({"owner_id": user_id}).to_list(500)
    for a in actions:
        a["_id"] = str(a["_id"])
    return actions


@router.post("", status_code=201)
async def create_action(data: ActionCreate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    doc = {"owner_id": user_id, "status": "active", "run_count": 0, "created_by_ai": False, **data.model_dump()}
    result = await db.actions.insert_one(doc)
    return {"id": str(result.inserted_id)}


@router.post("/generate", status_code=201)
async def generate_action(data: ActionGenerate, user_id: str = Depends(get_current_user_id)):
    """Generate an Action using Claude AI based on natural language description."""
    from app.services.claude_service import generate_action_with_ai

    action_data = await generate_action_with_ai(data.description, data.contact_id)
    db = get_db()
    doc = {
        "owner_id": user_id,
        "status": "active",
        "run_count": 0,
        "created_by_ai": True,
        **action_data,
    }
    result = await db.actions.insert_one(doc)
    return {"id": str(result.inserted_id), **action_data}


@router.patch("/{action_id}")
async def update_action(action_id: str, data: dict, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    result = await db.actions.update_one(
        {"_id": ObjectId(action_id), "owner_id": user_id},
        {"$set": data},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"ok": True}


@router.post("/{action_id}/toggle")
async def toggle_action(action_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    action = await db.actions.find_one({"_id": ObjectId(action_id), "owner_id": user_id})
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    new_status = "paused" if action["status"] == "active" else "active"
    await db.actions.update_one({"_id": action["_id"]}, {"$set": {"status": new_status}})
    return {"status": new_status}


@router.delete("/{action_id}")
async def delete_action(action_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    result = await db.actions.delete_one({"_id": ObjectId(action_id), "owner_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"ok": True}


@router.post("/{action_id}/run")
async def run_action_now(action_id: str, user_id: str = Depends(get_current_user_id)):
    """Enqueue this action to run immediately (ad-hoc trigger from UI)."""
    db = get_db()
    action = await db.actions.find_one({"_id": ObjectId(action_id), "owner_id": user_id})
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    from app.tasks.action_tasks import execute_action
    execute_action.delay(action_id)
    return {"queued": True}


@router.get("/failed")
async def list_failed_actions(user_id: str = Depends(get_current_user_id)):
    """List entries from the dead-letter collection (actions that exhausted retries)."""
    db = get_db()
    items = await db.failed_actions.find({"owner_id": user_id}).sort("failed_at", -1).to_list(200)
    for item in items:
        item["_id"] = str(item["_id"])
    return items


@router.delete("/failed/{item_id}")
async def delete_failed_action(item_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    result = await db.failed_actions.delete_one({"_id": ObjectId(item_id), "owner_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Failed action not found")
    return {"ok": True}
