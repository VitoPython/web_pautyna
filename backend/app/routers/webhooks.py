"""Incoming webhooks from external platforms.

Unipile posts events here (new messages, connection accepted, post published,
etc.). Each event is verified against a shared secret and then fanned out:
inserted into the appropriate MongoDB collection + pushed to the user's
WebSocket via Redis pub/sub.

NOTE: signature verification is a TODO — we don't have an active Unipile
account wired up yet. The endpoint accepts anything while UNIPILE_WEBHOOK_SECRET
is empty; once a secret is set, requests without a valid X-Unipile-Signature
header are rejected.
"""

import hmac
import hashlib
import logging
from datetime import datetime

from fastapi import APIRouter, Header, HTTPException, Request

from app.core.config import settings
from app.core.database import get_db
from app.services.realtime import publish_event

log = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _verify_signature(body: bytes, signature: str | None) -> bool:
    secret = getattr(settings, "UNIPILE_WEBHOOK_SECRET", "") or ""
    if not secret:
        # No secret configured yet — accept during early integration.
        return True
    if not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/unipile")
async def unipile_webhook(
    request: Request,
    x_unipile_signature: str | None = Header(None),
):
    raw = await request.body()
    if not _verify_signature(raw, x_unipile_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed JSON")

    event_type = event.get("event") or event.get("type") or event.get("status") or ""
    account_id = event.get("account_id") or event.get("accountId") or ""
    db = get_db()

    # ── Account lifecycle (from hosted-link notify_url or account_status webhook)
    # The hosted-link callback carries `name` (which we set to our user_id)
    # and a `status` of CREATION_SUCCESS / RECONNECTED etc.
    if event_type in ("CREATION_SUCCESS", "creation_success", "account.created", "RECONNECTED"):
        our_user_id = event.get("name") or ""  # we embed user_id here when creating the link
        if our_user_id and account_id:
            await _handle_account_connected(db, our_user_id, account_id, event)
        return {"ok": True, "handled": "account_created"}

    if event_type in ("CREATION_FAIL", "creation_fail", "account.disconnected", "DISCONNECTED"):
        log.info(f"Unipile account event {event_type}: account_id={account_id}")
        if account_id:
            await db.users.update_one(
                {"integrations.unipile.accounts.account_id": account_id},
                {"$set": {"integrations.unipile.accounts.$.status": "disconnected"}},
            )
        return {"ok": True, "handled": "account_status"}

    # ── Messaging / social events — lookup user by account_id
    user = await db.users.find_one({"integrations.unipile.accounts.account_id": account_id}) if account_id else None
    if not user:
        log.warning(f"Unipile event for unknown account_id={account_id}, type={event_type}")
        return {"ok": True, "matched": False}

    user_id = str(user["_id"])

    if event_type in ("message.received", "message_received", "message_new", "new_message"):
        await _handle_message_received(db, user_id, event)
    elif event_type in ("connection.accepted", "connection_accepted"):
        await _handle_connection_accepted(db, user_id, event)
    elif event_type in ("post.published", "post_published"):
        await _handle_post_published(db, user_id, event)
    else:
        log.info(f"Unhandled Unipile event type: {event_type}")

    return {"ok": True, "matched": True}


async def _handle_account_connected(db, user_id: str, account_id: str, event: dict):
    """Persist a newly connected Unipile account on the user document."""
    from bson import ObjectId
    provider = (
        event.get("provider")
        or event.get("type")
        or event.get("account_type")
        or ""
    ).lower()

    entry = {
        "account_id": account_id,
        "provider": provider,
        "status": "connected",
        "connected_at": datetime.utcnow(),
        "name": event.get("name_value") or event.get("display_name") or "",
    }

    # Upsert by account_id — avoid duplicates if webhook fires twice.
    try:
        uid = ObjectId(user_id)
    except Exception:
        log.warning(f"Unipile webhook carried invalid user_id={user_id}")
        return

    # Remove any stale entry with same account_id, then push fresh.
    await db.users.update_one(
        {"_id": uid},
        {"$pull": {"integrations.unipile.accounts": {"account_id": account_id}}},
    )
    await db.users.update_one(
        {"_id": uid},
        {"$push": {"integrations.unipile.accounts": entry}},
    )

    # Tell the user's WebSocket so the /integrations page can react live.
    await publish_event(user_id, "unipile_connected", {
        "account_id": account_id,
        "provider": provider,
    })
    log.info(f"Unipile: user {user_id} connected {provider} account {account_id}")


async def _handle_message_received(db, user_id: str, event: dict):
    platform = event.get("provider") or event.get("platform") or "linkedin"
    sender_profile = (
        event.get("sender", {}).get("profile_id")
        or event.get("from", {}).get("id")
        or ""
    )
    content = event.get("text") or event.get("message", "")

    contact = await db.contacts.find_one({
        "owner_id": user_id,
        "platforms.type": platform,
        "platforms.profile_id": str(sender_profile),
    }) if sender_profile else None

    if not contact:
        # Ignore messages from non-contacts (same rule as tg-listener).
        return

    contact_id = str(contact["_id"])
    now = datetime.utcnow()
    external_id = str(event.get("message_id") or event.get("id") or "")

    existing = await db.messages.find_one({
        "owner_id": user_id,
        "platform": platform,
        "external_id": external_id,
    }) if external_id else None
    if existing:
        return

    await db.messages.insert_one({
        "owner_id": user_id,
        "contact_id": contact_id,
        "platform": platform,
        "direction": "inbound",
        "content": content,
        "subject": "",
        "media_urls": [],
        "external_id": external_id,
        "read": False,
        "sent_at": now,
        "created_at": now,
    })

    await db.notifications.insert_one({
        "owner_id": user_id,
        "type": "new_message",
        "title": f"Повідомлення від {contact.get('name', 'контакта')}",
        "body": content[:200],
        "contact_id": contact_id,
        "read": False,
        "platform": platform,
        "created_at": now,
    })

    await publish_event(user_id, "new_message", {
        "contact_id": contact_id,
        "contact_name": contact.get("name", ""),
        "contact_avatar": contact.get("avatar_url", ""),
        "platform": platform,
        "content": content,
        "sent_at": now.isoformat(),
    })


async def _handle_connection_accepted(db, user_id: str, event: dict):
    profile_id = event.get("profile_id") or event.get("account_id_from") or ""
    platform = event.get("provider") or "linkedin"
    contact = await db.contacts.find_one({
        "owner_id": user_id,
        "platforms.type": platform,
        "platforms.profile_id": str(profile_id),
    }) if profile_id else None

    name = contact.get("name") if contact else (event.get("name") or "контакт")
    await db.notifications.insert_one({
        "owner_id": user_id,
        "type": "connection_accepted",
        "title": f"{name} прийняв(ла) запит",
        "body": "",
        "contact_id": str(contact["_id"]) if contact else None,
        "read": False,
        "platform": platform,
        "created_at": datetime.utcnow(),
    })
    await publish_event(user_id, "notification", {"type": "connection_accepted", "name": name})


async def _handle_post_published(db, user_id: str, event: dict):
    author_id = event.get("author_id") or ""
    platform = event.get("provider") or "linkedin"
    contact = await db.contacts.find_one({
        "owner_id": user_id,
        "platforms.type": platform,
        "platforms.profile_id": str(author_id),
    }) if author_id else None
    if not contact:
        return

    await db.notifications.insert_one({
        "owner_id": user_id,
        "type": "new_post",
        "title": f"{contact.get('name')} опублікував пост",
        "body": (event.get("text") or "")[:200],
        "contact_id": str(contact["_id"]),
        "read": False,
        "platform": platform,
        "created_at": datetime.utcnow(),
    })
    await publish_event(user_id, "notification", {"type": "new_post", "contact_id": str(contact["_id"])})
