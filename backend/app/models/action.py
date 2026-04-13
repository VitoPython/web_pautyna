from datetime import datetime

from pydantic import BaseModel, Field


class ActionTrigger(BaseModel):
    type: str = "schedule"  # schedule | event | condition
    cron: str | None = None
    event: str | None = None  # no_reply | birthday | new_post
    condition: dict = {}


class ActionStep(BaseModel):
    order: int
    type: str  # send_message | create_note | add_reminder | fetch_posts
    platform: str | None = None
    content: str = ""
    delay_minutes: int = 0


class Action(BaseModel):
    id: str | None = Field(None, alias="_id")
    owner_id: str
    contact_id: str | None = None
    name: str
    description: str = ""
    trigger: ActionTrigger = ActionTrigger()
    steps: list[ActionStep] = []
    status: str = "active"  # active | paused | completed | error
    last_run: datetime | None = None
    next_run: datetime | None = None
    run_count: int = 0
    created_by_ai: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ActionCreate(BaseModel):
    name: str
    description: str = ""
    contact_id: str | None = None
    trigger: ActionTrigger = ActionTrigger()
    steps: list[ActionStep] = []


class ActionGenerate(BaseModel):
    description: str
    contact_id: str | None = None
