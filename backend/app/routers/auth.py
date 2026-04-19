from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr

from app.core.database import get_db
from app.core.security import (
    clear_auth_cookie,
    create_access_token,
    get_current_user_id,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.models.user import UserCreate, UserLogin, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, response: Response):
    db = get_db()

    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Користувач з цим email вже існує",
        )

    if len(data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Пароль має бути мінімум 6 символів",
        )

    now = datetime.utcnow()
    user_doc = {
        "email": data.email,
        "name": data.name.strip(),
        "password_hash": hash_password(data.password),
        "avatar_url": "",
        "plan": "free",
        "unipile": {
            "account_id": "",
            "linkedin_connected": False,
            "instagram_connected": False,
        },
        "settings": {
            "theme": "dark",
            "notifications": True,
            "ai_suggestions": True,
        },
        "created_at": now,
        "updated_at": now,
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    await db.canvases.insert_one(
        {
            "owner_id": user_id,
            "name": "Моя Мережа",
            "nodes": [],
            "edges": [],
            "created_at": now,
        }
    )

    token = create_access_token(user_id)
    set_auth_cookie(response, token)

    return {"user_id": user_id}


@router.post("/login")
async def login(data: UserLogin, response: Response):
    db = get_db()
    user = await db.users.find_one({"email": data.email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невірний email або пароль",
        )

    user_id = str(user["_id"])
    token = create_access_token(user_id)
    set_auth_cookie(response, token)

    return {"user_id": user_id}


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
async def me(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Користувач не знайдений",
        )
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        name=user["name"],
        avatar_url=user.get("avatar_url", ""),
        plan=user.get("plan", "free"),
        settings=user.get("settings", {}),
    )


class ProfileUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    avatar_url: str | None = None


@router.patch("/me", response_model=UserResponse)
async def update_me(data: ProfileUpdate, user_id: str = Depends(get_current_user_id)):
    """Edit own profile. Email changes require uniqueness; password is separate."""
    db = get_db()
    updates: dict = {"updated_at": datetime.utcnow()}

    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Ім'я не може бути порожнім")
        updates["name"] = name

    if data.email is not None:
        new_email = data.email.lower().strip()
        clash = await db.users.find_one({"email": new_email, "_id": {"$ne": ObjectId(user_id)}})
        if clash:
            raise HTTPException(status_code=409, detail="Цей email вже використовується")
        updates["email"] = new_email

    if data.avatar_url is not None:
        updates["avatar_url"] = data.avatar_url

    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Користувач не знайдений")
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        name=user["name"],
        avatar_url=user.get("avatar_url", ""),
        plan=user.get("plan", "free"),
        settings=user.get("settings", {}),
    )


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/me/password")
async def change_password(data: PasswordChange, user_id: str = Depends(get_current_user_id)):
    if len(data.new_password) < 6:
        raise HTTPException(status_code=422, detail="Новий пароль має бути мінімум 6 символів")
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user or not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Поточний пароль невірний")
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"password_hash": hash_password(data.new_password), "updated_at": datetime.utcnow()}},
    )
    return {"ok": True}
