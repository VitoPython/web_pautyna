from datetime import datetime

from pydantic import BaseModel, Field


class CampaignStep(BaseModel):
    """One step in the campaign sequence."""
    order: int
    type: str = "send_message"  # send_message only for MVP
    platform: str | None = None  # telegram | gmail | linkedin | ...
    content: str = ""
    subject: str = ""  # for email
    delay_minutes: int = 0  # delay before this step runs (from previous step's completion)


class Campaign(BaseModel):
    id: str | None = Field(None, alias="_id")
    owner_id: str
    name: str
    description: str = ""
    status: str = "draft"  # draft | active | paused | done
    steps: list[CampaignStep] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CampaignCreate(BaseModel):
    name: str
    description: str = ""
    steps: list[CampaignStep] = []


class CampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    steps: list[CampaignStep] | None = None


class CampaignLead(BaseModel):
    id: str | None = Field(None, alias="_id")
    campaign_id: str
    owner_id: str
    contact_id: str
    status: str = "pending"  # pending | in_progress | replied | done | error
    current_step: int = 0  # index of the NEXT step to execute
    next_action_at: datetime | None = None
    last_action_at: datetime | None = None
    error: str = ""
    added_at: datetime = Field(default_factory=datetime.utcnow)


class LeadAdd(BaseModel):
    contact_ids: list[str]
