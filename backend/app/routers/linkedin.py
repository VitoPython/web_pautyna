from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from app.core.security import get_current_user_id
from app.services import linkedin_service

router = APIRouter(prefix="/linkedin", tags=["linkedin"])


@router.get("/auth/url")
async def get_auth_url(user_id: str = Depends(get_current_user_id)):
    try:
        url = linkedin_service.get_auth_url(user_id)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/callback")
async def oauth_callback(code: str, state: str):
    try:
        await linkedin_service.handle_callback(code, user_id=state)
        return RedirectResponse(url="/integrations?linkedin=connected")
    except Exception as e:
        return RedirectResponse(url="/integrations?linkedin=error")


@router.get("/profile")
async def get_profile(user_id: str = Depends(get_current_user_id)):
    try:
        return await linkedin_service.get_profile(user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/disconnect")
async def disconnect(user_id: str = Depends(get_current_user_id)):
    await linkedin_service.disconnect(user_id)
    return {"ok": True}
