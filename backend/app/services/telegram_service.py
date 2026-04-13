"""Telegram Client API integration using Telethon.

Each user gets their own Telegram session stored in MongoDB.
Sessions persist between restarts — user stays logged in.
"""

import os
import asyncio
from datetime import datetime

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.functions.contacts import GetContactsRequest
from telethon.tl.functions.messages import GetDialogsRequest
from telethon.tl.types import InputPeerEmpty, User as TgUser

from app.core.config import settings
from app.core.database import get_db

# Directory for session files
SESSIONS_DIR = "/tmp/tg_sessions"
os.makedirs(SESSIONS_DIR, exist_ok=True)

# Active clients cache: user_id -> TelegramClient
_clients: dict[str, TelegramClient] = {}


async def _get_or_create_client(user_id: str) -> TelegramClient:
    """Get cached client or create new one from stored session."""
    if user_id in _clients and _clients[user_id].is_connected():
        return _clients[user_id]

    db = get_db()
    user = await db.users.find_one({"_id": __import__("bson").ObjectId(user_id)})
    session_str = ""
    if user and user.get("integrations", {}).get("telegram", {}).get("session"):
        session_str = user["integrations"]["telegram"]["session"]

    client = TelegramClient(
        StringSession(session_str),
        settings.TELEGRAM_API_ID,
        settings.TELEGRAM_API_HASH,
    )
    await client.connect()
    _clients[user_id] = client
    return client


async def _save_session(user_id: str, client: TelegramClient, phone: str = ""):
    """Save session string to MongoDB."""
    db = get_db()
    session_str = client.session.save()
    update: dict = {
        "integrations.telegram.session": session_str,
        "integrations.telegram.connected": True,
    }
    if phone:
        update["integrations.telegram.phone"] = phone

    await db.users.update_one(
        {"_id": __import__("bson").ObjectId(user_id)},
        {"$set": update},
    )


async def start_auth(user_id: str, phone: str) -> dict:
    """Step 1: Send verification code to phone number."""
    if not settings.TELEGRAM_API_ID or not settings.TELEGRAM_API_HASH:
        raise ValueError("Telegram API credentials not configured")

    client = TelegramClient(
        StringSession(),
        settings.TELEGRAM_API_ID,
        settings.TELEGRAM_API_HASH,
    )
    await client.connect()
    _clients[user_id] = client

    result = await client.send_code_request(phone)
    # Store phone_code_hash temporarily
    return {
        "phone_code_hash": result.phone_code_hash,
        "status": "code_sent",
    }


async def verify_code(user_id: str, phone: str, code: str, phone_code_hash: str, password: str = "") -> dict:
    """Step 2: Verify the code (and optional 2FA password)."""
    client = _clients.get(user_id)
    if not client:
        raise ValueError("No active auth session. Start auth first.")

    try:
        await client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
    except Exception as e:
        err_name = type(e).__name__
        if "SessionPasswordNeeded" in err_name:
            if not password:
                return {"status": "2fa_required"}
            await client.sign_in(password=password)
        else:
            raise

    # Save session
    await _save_session(user_id, client, phone)

    me = await client.get_me()
    name = f"{me.first_name or ''} {me.last_name or ''}".strip()

    return {
        "status": "connected",
        "name": name,
        "phone": phone,
        "username": me.username or "",
    }


async def list_contacts(user_id: str, query: str = "") -> list[dict]:
    """List Telegram contacts for selection (without importing). Supports search."""
    client = await _get_or_create_client(user_id)
    if not await client.is_user_authorized():
        raise ValueError("Telegram not connected")

    result = await client(GetContactsRequest(hash=0))
    db = get_db()
    q = query.lower().strip()
    contacts = []

    for user in result.users:
        if not isinstance(user, TgUser) or user.bot:
            continue

        name = f"{user.first_name or ''} {user.last_name or ''}".strip()
        if not name:
            continue

        username = user.username or ""
        phone = f"+{user.phone}" if user.phone else ""

        # Filter by search query
        if q and q not in name.lower() and q not in username.lower() and q not in phone:
            continue

        # Check if already imported
        existing = await db.contacts.find_one({
            "owner_id": user_id,
            "platforms.type": "telegram",
            "platforms.profile_id": str(user.id),
        })

        contacts.append({
            "tg_id": str(user.id),
            "name": name,
            "username": username,
            "phone": phone,
            "already_imported": existing is not None,
        })

    return contacts


async def import_selected(user_id: str, tg_ids: list[str]) -> dict:
    """Import only selected Telegram contacts by their Telegram user IDs."""
    client = await _get_or_create_client(user_id)
    if not await client.is_user_authorized():
        raise ValueError("Telegram not connected")

    result = await client(GetContactsRequest(hash=0))
    db = get_db()
    now = datetime.utcnow()

    # Build lookup of selected IDs
    selected_set = set(tg_ids)
    imported = 0
    skipped = 0

    for user in result.users:
        if not isinstance(user, TgUser) or user.bot:
            continue
        if str(user.id) not in selected_set:
            continue

        name = f"{user.first_name or ''} {user.last_name or ''}".strip()
        if not name:
            continue

        # Check duplicate
        existing = await db.contacts.find_one({
            "owner_id": user_id,
            "platforms.type": "telegram",
            "platforms.profile_id": str(user.id),
        })
        if existing:
            skipped += 1
            continue

        phone = f"+{user.phone}" if user.phone else ""
        username = user.username or ""

        contact_doc = {
            "owner_id": user_id,
            "name": name,
            "avatar_url": "",
            "email": "",
            "phone": phone,
            "job_title": "",
            "company": "",
            "website": "",
            "platforms": [{
                "type": "telegram",
                "profile_id": str(user.id),
                "profile_url": f"https://t.me/{username}" if username else "",
                "connected_at": now,
            }],
            "tags": ["telegram"],
            "position": {"x": 0, "y": 0},
            "created_at": now,
        }

        res = await db.contacts.insert_one(contact_doc)
        contact_id = str(res.inserted_id)

        canvas = await db.canvases.find_one({"owner_id": user_id})
        if canvas:
            await db.canvases.update_one(
                {"_id": canvas["_id"]},
                {"$push": {"nodes": {
                    "contact_id": contact_id,
                    "x": 0, "y": 0, "is_center": False,
                }}},
            )

        imported += 1

    return {"imported": imported, "skipped": skipped}


async def get_recent_chats(user_id: str, limit: int = 30) -> list[dict]:
    """Get recent Telegram dialogs/chats."""
    client = await _get_or_create_client(user_id)
    if not await client.is_user_authorized():
        raise ValueError("Telegram not connected")

    dialogs = await client.get_dialogs(limit=limit)
    chats = []

    for dialog in dialogs:
        if dialog.is_user and not dialog.entity.bot:
            entity = dialog.entity
            name = f"{entity.first_name or ''} {entity.last_name or ''}".strip()
            chats.append({
                "id": str(entity.id),
                "name": name,
                "username": entity.username or "",
                "phone": f"+{entity.phone}" if entity.phone else "",
                "unread_count": dialog.unread_count,
                "last_message": dialog.message.text if dialog.message else "",
                "last_date": dialog.date.isoformat() if dialog.date else "",
            })

    return chats


async def disconnect(user_id: str):
    """Disconnect Telegram and clear session."""
    client = _clients.pop(user_id, None)
    if client:
        try:
            await client.log_out()
        except Exception:
            pass
        await client.disconnect()

    db = get_db()
    await db.users.update_one(
        {"_id": __import__("bson").ObjectId(user_id)},
        {"$set": {
            "integrations.telegram.connected": False,
            "integrations.telegram.session": "",
            "integrations.telegram.phone": "",
        }},
    )
