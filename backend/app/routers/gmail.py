from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.security import get_current_user_id
from app.services import gmail_service

router = APIRouter(prefix="/gmail", tags=["gmail"])


@router.get("/auth/url")
async def get_auth_url(user_id: str = Depends(get_current_user_id)):
    try:
        url = gmail_service.get_auth_url(user_id)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/callback")
async def oauth_callback(code: str, state: str):
    try:
        await gmail_service.handle_callback(code, user_id=state)
        return RedirectResponse(url="/integrations?gmail=connected")
    except Exception as e:
        return RedirectResponse(url=f"/integrations?gmail=error")


@router.get("/contacts")
async def list_contacts(q: str = "", user_id: str = Depends(get_current_user_id)):
    """List Google contacts for selection."""
    try:
        contacts = await gmail_service.list_contacts(user_id, query=q)
        return contacts
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class ImportSelectedRequest(BaseModel):
    contact_ids: list[str]


@router.post("/contacts/import")
async def import_selected(data: ImportSelectedRequest, user_id: str = Depends(get_current_user_id)):
    """Import selected Google contacts."""
    try:
        result = await gmail_service.import_selected(user_id, data.contact_ids)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str


@router.get("/messages/{contact_email}")
async def get_messages(contact_email: str, user_id: str = Depends(get_current_user_id)):
    try:
        messages = await gmail_service.get_messages(user_id, contact_email)
        return messages
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/send")
async def send_message(data: SendEmailRequest, user_id: str = Depends(get_current_user_id)):
    try:
        result = await gmail_service.send_message(user_id, data.to, data.subject, data.body)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/disconnect")
async def disconnect(user_id: str = Depends(get_current_user_id)):
    await gmail_service.disconnect(user_id)
    return {"ok": True}
