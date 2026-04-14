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


async def _get_or_create_client(user_id: str, auth_mode: bool = False) -> TelegramClient:
    """Get cached client or create new one from stored session.

    Default: receive_updates=False so events flow to tg-listener worker.
    auth_mode=True: creates a fresh client without session (for login flow).
    """
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
        receive_updates=False,  # let tg-listener receive events exclusively
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


async def send_message(user_id: str, tg_profile_id: str, text: str) -> dict:
    """Send a Telegram message to a user by their Telegram ID."""
    client = await _get_or_create_client(user_id)
    if not await client.is_user_authorized():
        raise ValueError("Telegram not connected")

    entity = await client.get_entity(int(tg_profile_id))
    result = await client.send_message(entity, text)
    return {
        "message_id": result.id,
        "date": result.date.isoformat() if result.date else "",
    }


async def fetch_message_history(user_id: str, tg_profile_id: str, limit: int = 50) -> list[dict]:
    """Fetch recent message history with a Telegram user and sync to MongoDB."""
    client = await _get_or_create_client(user_id)
    if not await client.is_user_authorized():
        raise ValueError("Telegram not connected")

    db = get_db()
    entity = await client.get_entity(int(tg_profile_id))
    me = await client.get_me()

    # Find our contact record for this telegram user
    contact = await db.contacts.find_one({
        "owner_id": user_id,
        "platforms.type": "telegram",
        "platforms.profile_id": str(tg_profile_id),
    })
    if not contact:
        return []
    contact_id = str(contact["_id"])

    messages = []
    async for msg in client.iter_messages(entity, limit=limit):
        if not msg.message:
            continue

        direction = "outbound" if msg.sender_id == me.id else "inbound"
        external_id = str(msg.id)

        # Check if already saved
        existing = await db.messages.find_one({
            "owner_id": user_id,
            "platform": "telegram",
            "external_id": external_id,
        })
        if existing:
            existing["_id"] = str(existing["_id"])
            messages.append(existing)
            continue

        doc = {
            "owner_id": user_id,
            "contact_id": contact_id,
            "platform": "telegram",
            "direction": direction,
            "content": msg.message,
            "subject": "",
            "media_urls": [],
            "external_id": external_id,
            "read": direction == "outbound",
            "sent_at": msg.date,
            "created_at": datetime.utcnow(),
        }
        res = await db.messages.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        messages.append(doc)

    # Sort by sent_at ascending for chat display
    messages.sort(key=lambda m: m.get("sent_at") or datetime.min)
    return messages


async def listen_for_messages(user_id: str, ws_manager=None):
    """Long-running task: listen for new incoming Telegram messages and save them.

    This is meant to run as a Celery task or background process.
    """
    from telethon import events

    client = await _get_or_create_client(user_id)
    if not await client.is_user_authorized():
        return

    db = get_db()
    me = await client.get_me()

    @client.on(events.NewMessage(incoming=True))
    async def handler(event):
        sender_id = event.sender_id
        if sender_id == me.id:
            return

        # Find contact
        contact = await db.contacts.find_one({
            "owner_id": user_id,
            "platforms.type": "telegram",
            "platforms.profile_id": str(sender_id),
        })
        if not contact:
            return  # Message from user not in contacts — skip

        contact_id = str(contact["_id"])
        doc = {
            "owner_id": user_id,
            "contact_id": contact_id,
            "platform": "telegram",
            "direction": "inbound",
            "content": event.message.message or "",
            "subject": "",
            "media_urls": [],
            "external_id": str(event.message.id),
            "read": False,
            "sent_at": event.message.date,
            "created_at": datetime.utcnow(),
        }
        await db.messages.insert_one(doc)

        # Push via WebSocket if available
        if ws_manager:
            await ws_manager.send_to_user(user_id, "new_message", {
                "contact_id": contact_id,
                "contact_name": contact.get("name", ""),
                "platform": "telegram",
                "content": event.message.message or "",
                "sent_at": event.message.date.isoformat() if event.message.date else "",
            })

    # Run forever
    await client.run_until_disconnected()


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
