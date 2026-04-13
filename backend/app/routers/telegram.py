from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import get_current_user_id
from app.services import telegram_service

router = APIRouter(prefix="/telegram", tags=["telegram"])


class StartAuthRequest(BaseModel):
    phone: str


class VerifyCodeRequest(BaseModel):
    phone: str
    code: str
    phone_code_hash: str
    password: str = ""


class ImportSelectedRequest(BaseModel):
    contact_ids: list[str]


@router.post("/auth/start")
async def start_auth(data: StartAuthRequest, user_id: str = Depends(get_current_user_id)):
    try:
        result = await telegram_service.start_auth(user_id, data.phone)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auth/verify")
async def verify_code(data: VerifyCodeRequest, user_id: str = Depends(get_current_user_id)):
    try:
        result = await telegram_service.verify_code(
            user_id, data.phone, data.code, data.phone_code_hash, data.password
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/contacts")
async def search_contacts(q: str = "", user_id: str = Depends(get_current_user_id)):
    """Search Telegram contacts without importing. Returns list for selection."""
    try:
        contacts = await telegram_service.list_contacts(user_id, query=q)
        return contacts
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/contacts/import")
async def import_selected(data: ImportSelectedRequest, user_id: str = Depends(get_current_user_id)):
    """Import only selected Telegram contacts by their IDs."""
    try:
        result = await telegram_service.import_selected(user_id, data.contact_ids)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/chats")
async def get_chats(user_id: str = Depends(get_current_user_id)):
    try:
        chats = await telegram_service.get_recent_chats(user_id)
        return chats
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/disconnect")
async def disconnect(user_id: str = Depends(get_current_user_id)):
    await telegram_service.disconnect(user_id)
    return {"ok": True}
