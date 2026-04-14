from datetime import datetime

from pydantic import BaseModel, Field


class Block(BaseModel):
    id: str
    type: str  # heading_1 | paragraph | todo | image | video | table | database | page
    content: str = ""
    checked: bool | None = None
    children: list["Block"] = []
    meta: dict = {}


class Page(BaseModel):
    id: str | None = Field(None, alias="_id")
    owner_id: str
    contact_id: str | None = None
    parent_page_id: str | None = None
    title: str = ""
    icon: str = "📄"
    blocks: list[Block] = []
    sub_pages: list[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PageCreate(BaseModel):
    contact_id: str | None = None
    parent_page_id: str | None = None
    title: str = ""
    icon: str = "📄"


class PageUpdate(BaseModel):
    title: str | None = None
    icon: str | None = None
    blocks: dict | list[dict] | None = None  # TipTap JSON doc
