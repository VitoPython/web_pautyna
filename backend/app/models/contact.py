from datetime import datetime

from pydantic import BaseModel, Field


class Platform(BaseModel):
    type: str  # "linkedin" | "instagram" | "telegram" | "gmail"
    profile_id: str
    profile_url: str = ""
    connected_at: datetime = Field(default_factory=datetime.utcnow)


class Position(BaseModel):
    x: float = 0
    y: float = 0


class Contact(BaseModel):
    id: str | None = Field(None, alias="_id")
    owner_id: str
    name: str
    avatar_url: str = ""
    email: str = ""
    phone: str = ""
    job_title: str = ""
    company: str = ""
    website: str = ""
    platforms: list[Platform] = []
    tags: list[str] = []
    position: Position = Position()
    canvas_id: str | None = None
    note_page_id: str | None = None
    last_interaction: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ContactCreate(BaseModel):
    name: str
    avatar_url: str = ""
    email: str = ""
    phone: str = ""
    job_title: str = ""
    company: str = ""
    website: str = ""
    platforms: list[Platform] = []
    tags: list[str] = []
    position: Position = Position()


class ContactUpdate(BaseModel):
    name: str | None = None
    avatar_url: str | None = None
    email: str | None = None
    phone: str | None = None
    job_title: str | None = None
    company: str | None = None
    website: str | None = None
    platforms: list[Platform] | None = None
    tags: list[str] | None = None
    position: Position | None = None
