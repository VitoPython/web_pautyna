from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UnipileConfig(BaseModel):
    account_id: str = ""
    linkedin_connected: bool = False
    instagram_connected: bool = False


class UserSettings(BaseModel):
    theme: str = "dark"
    notifications: bool = True
    ai_suggestions: bool = True


class User(BaseModel):
    id: str | None = Field(None, alias="_id")
    email: EmailStr
    name: str
    password_hash: str
    avatar_url: str = ""
    plan: str = "free"
    unipile: UnipileConfig = UnipileConfig()
    settings: UserSettings = UserSettings()
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str
    plan: str
    settings: UserSettings
