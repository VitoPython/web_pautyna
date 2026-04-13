from datetime import datetime

from pydantic import BaseModel, Field


class CanvasNode(BaseModel):
    contact_id: str
    x: float = 0
    y: float = 0
    is_center: bool = False


class CanvasEdge(BaseModel):
    id: str | None = None
    source: str  # contact_id
    target: str  # contact_id
    type: str = "acquaintance"  # acquaintance | partner | client | friend
    strength: int = 1


class Canvas(BaseModel):
    id: str | None = Field(None, alias="_id")
    owner_id: str
    name: str = "Моя Мережа"
    nodes: list[CanvasNode] = []
    edges: list[CanvasEdge] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)


class EdgeCreate(BaseModel):
    source: str
    target: str
    type: str = "acquaintance"
    strength: int = 1
