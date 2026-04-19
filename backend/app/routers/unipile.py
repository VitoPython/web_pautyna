"""Endpoints for managing Unipile integrations from the frontend.

Flow:
1. User clicks "Connect account" in /integrations → POST /unipile/hosted-link
   with a list of providers.
2. Backend asks Unipile for a hosted URL, returns it.
3. User is redirected to Unipile, completes OAuth/login there.
4. Unipile calls our /webhooks/unipile (account_status source) with the new
   account_id; we persist it under user.integrations.unipile.accounts.
5. Frontend polls GET /unipile/accounts to see the new entry appear.
"""

import logging

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user_id
from app.services import unipile_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/unipile", tags=["unipile"])


class HostedLinkRequest(BaseModel):
    providers: list[str] | str = "*"


@router.post("/hosted-link")
async def create_hosted_link(
    data: HostedLinkRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate a Unipile hosted auth URL for this user."""
    public_url = (settings.PUBLIC_URL or "http://localhost").rstrip("/")
    try:
        url = await unipile_service.create_hosted_auth_link(
            user_id=user_id,
            providers=data.providers,
            success_url=f"{public_url}/integrations?unipile=success",
            failure_url=f"{public_url}/integrations?unipile=failure",
            notify_url=f"{public_url}/webhooks/unipile",
        )
    except Exception as e:
        log.exception("Unipile hosted-link failed")
        raise HTTPException(status_code=502, detail=f"Unipile error: {e}")
    return {"url": url}


@router.get("/accounts")
async def list_user_accounts(user_id: str = Depends(get_current_user_id)):
    """Return the Unipile accounts linked to the current user.

    Source of truth is Unipile, but we filter/annotate using the account_ids
    stored on the user document.
    """
    db = get_db()
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    linked = user.get("integrations", {}).get("unipile", {}).get("accounts", [])
    linked_ids = {a.get("account_id") for a in linked}

    # Hydrate with live status from Unipile — if it fails, fall back to local cache.
    live: dict[str, dict] = {}
    try:
        remote = await unipile_service.list_accounts()
        for acc in remote:
            aid = acc.get("id") or acc.get("account_id") or ""
            if aid:
                live[aid] = acc
    except Exception as e:
        log.warning(f"Unipile list_accounts failed — using local cache: {e}")

    def _shape(aid: str, remote_acc: dict, local: dict | None, orphan: bool):
        # Unipile real schema: type, name, sources[0].status, id, created_at,
        # connection_params.im.username
        sources = remote_acc.get("sources") or []
        live_status = sources[0].get("status") if sources else ""
        return {
            "account_id": aid,
            "provider": (local or {}).get("provider") or remote_acc.get("type", "") or "",
            "status": live_status or (local or {}).get("status", "unknown"),
            "name": remote_acc.get("name") or (local or {}).get("name", ""),
            "email": remote_acc.get("email") or (local or {}).get("email", ""),
            "connected_at": (local or {}).get("connected_at") or remote_acc.get("created_at"),
            "orphan": orphan,
        }

    items = [_shape(a.get("account_id", ""), live.get(a.get("account_id", ""), {}), a, False) for a in linked]
    for aid, remote_acc in live.items():
        if aid in linked_ids:
            continue
        items.append(_shape(aid, remote_acc, None, True))

    return items


@router.post("/accounts/{account_id}/claim")
async def claim_orphan_account(account_id: str, user_id: str = Depends(get_current_user_id)):
    """Manually attach an existing Unipile account to this user.

    Useful when the webhook callback couldn't reach us (local dev without a
    public URL) — user can still claim the account they connected in Unipile.
    """
    db = get_db()
    try:
        remote = await unipile_service.get_account(account_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Account not found in Unipile: {e}")

    # Reject if already claimed by someone (including this user).
    already = await db.users.find_one({"integrations.unipile.accounts.account_id": account_id})
    if already and str(already["_id"]) != user_id:
        raise HTTPException(status_code=409, detail="Account already linked to another user")

    from datetime import datetime
    entry = {
        "account_id": account_id,
        "provider": (remote.get("type") or "").lower(),
        "status": "connected",
        "connected_at": datetime.utcnow(),
        "name": remote.get("name", ""),
    }

    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$pull": {"integrations.unipile.accounts": {"account_id": account_id}}},
    )
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$push": {"integrations.unipile.accounts": entry}},
    )
    return {"ok": True, "provider": entry["provider"]}


@router.delete("/accounts/{account_id}")
async def delete_user_account(account_id: str, user_id: str = Depends(get_current_user_id)):
    """Disconnect an account both remotely (Unipile) and locally."""
    db = get_db()
    try:
        await unipile_service.delete_account(account_id)
    except Exception as e:
        log.warning(f"Unipile delete_account {account_id} failed: {e}")
        # Still proceed to clear locally — the record is stale either way.

    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$pull": {"integrations.unipile.accounts": {"account_id": account_id}}},
    )
    return {"ok": True}


@router.get("/avatar/{contact_id}")
async def get_contact_avatar(contact_id: str, user_id: str = Depends(get_current_user_id)):
    """Proxy the contact's Unipile attendee picture.

    We stream binary JPEG bytes from Unipile rather than store them in Mongo
    to keep documents small. Clients cache via HTTP Cache-Control.
    """
    db = get_db()
    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    plat = next(
        (p for p in contact.get("platforms", [])
         if p.get("attendee_id") and p.get("account_id")),
        None,
    )
    if not plat:
        raise HTTPException(status_code=404, detail="No Unipile avatar for this contact")

    result = await unipile_service.fetch_attendee_picture(plat["account_id"], plat["attendee_id"])
    if not result:
        # No picture on remote side — 404 so the frontend falls back to the initial letter.
        raise HTTPException(status_code=404, detail="No avatar")

    content, ctype = result
    return Response(
        content=content,
        media_type=ctype or "image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"},
    )
