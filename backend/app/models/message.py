from datetime import datetime

from pydantic import BaseModel, Field


class Message(BaseModel):
    id: str | None = Field(None, alias="_id")
    owner_id: str
    contact_id: str
    platform: str  # linkedin | instagram
    direction: str  # inbound | outbound
    content: str
    media_urls: list[str] = []
    unipile_message_id: str | None = None
    read: bool = False
    sent_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MessageSend(BaseModel):
    contact_id: str
    platform: str
    content: str


class Notification(BaseModel):
    id: str | None = Field(None, alias="_id")
    owner_id: str
    type: str  # new_message | action_completed | new_post | connection_accepted
    title: str
    body: str = ""
    contact_id: str | None = None
    action_id: str | None = None
    read: bool = False
    platform: str = "system"
    created_at: datetime = Field(default_factory=datetime.utcnow)
