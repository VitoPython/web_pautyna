import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.canvas import EdgeCreate

router = APIRouter(prefix="/canvas", tags=["canvas"])


@router.get("")
async def get_canvas(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    canvas = await db.canvases.find_one({"owner_id": user_id})
    if not canvas:
        raise HTTPException(status_code=404, detail="Canvas not found")
    canvas["_id"] = str(canvas["_id"])
    return canvas


@router.post("/edges", status_code=201)
async def add_edge(data: EdgeCreate, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    edge = {
        "id": str(uuid.uuid4()),
        "source": data.source,
        "target": data.target,
        "type": data.type,
        "strength": data.strength,
    }
    result = await db.canvases.update_one(
        {"owner_id": user_id},
        {"$push": {"edges": edge}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Canvas not found")
    return edge


@router.delete("/edges/{edge_id}")
async def delete_edge(edge_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    result = await db.canvases.update_one(
        {"owner_id": user_id},
        {"$pull": {"edges": {"id": edge_id}}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Canvas not found")
    return {"ok": True}
