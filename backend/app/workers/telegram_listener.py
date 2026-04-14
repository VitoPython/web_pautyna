"""Telegram listener — long-running process that listens for new messages
for all users who connected their Telegram.

Runs as a separate Docker service. Monitors MongoDB for connected users
and attaches event handlers. New messages are saved to DB and pushed
to frontend via WebSocket (via Redis pub/sub to bridge processes).
"""

import asyncio
import json
import logging
from datetime import datetime

import redis.asyncio as aioredis
from telethon import TelegramClient, events
from telethon.sessions import StringSession

from app.core.config import settings
from app.core.database import connect_db, close_db, get_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("tg-listener")

# Active clients: user_id -> (client, session_str)
active_clients: dict[str, tuple[TelegramClient, str]] = {}


async def _publish_new_message(redis_client, user_id: str, payload: dict):
    """Push message event to Redis channel for WebSocket server to pick up."""
    await redis_client.publish(
        f"ws:user:{user_id}",
        json.dumps({"type": "new_message", "payload": payload}),
    )


async def _detach_user(user_id: str):
    """Disconnect the client for user and remove from active_clients."""
    entry = active_clients.pop(user_id, None)
    if not entry:
        return
    client, _ = entry
    try:
        await client.disconnect()
    except Exception:
        pass
    log.info(f"[{user_id}] Detached listener")


async def _watch_disconnect(user_id: str, client: TelegramClient):
    """Await until the client disconnects, then drop it from active_clients
    so the next scan will re-attach a fresh session."""
    try:
        await client.disconnected
    except Exception:
        pass
    # Only remove if this is still the current client (session may have been rotated)
    entry = active_clients.get(user_id)
    if entry and entry[0] is client:
        active_clients.pop(user_id, None)
        log.warning(f"[{user_id}] Client disconnected — will re-attach on next scan")


async def _attach_user(user_id: str, session_str: str, redis_client):
    """Attach Telegram listener for a specific user."""
    client = TelegramClient(
        StringSession(session_str),
        settings.TELEGRAM_API_ID,
        settings.TELEGRAM_API_HASH,
    )
    try:
        await client.connect()
        if not await client.is_user_authorized():
            log.warning(f"User {user_id} not authorized, skipping")
            await client.disconnect()
            return

        me = await client.get_me()
        log.info(f"Attached listener for user {user_id} ({me.first_name or ''} {me.last_name or ''})")

        db = get_db()

        @client.on(events.NewMessage(incoming=True))
        async def handler(event):
            sender_id = event.sender_id
            if sender_id == me.id:
                return

            log.info(f"[{user_id}] 📨 New message from sender_id={sender_id}: {(event.message.message or '')[:60]}")

            # Only accept messages from senders that are already in the user's
            # contact list (imported via UI). Everything else (bots, spam,
            # random DMs, channel forwards) is ignored — user's inbox stays
            # focused on people they actually care about.
            contact = await db.contacts.find_one({
                "owner_id": user_id,
                "platforms.type": "telegram",
                "platforms.profile_id": str(sender_id),
            })
            if not contact:
                return

            contact_id = str(contact["_id"])

            # Check if already saved (avoid duplicates)
            existing = await db.messages.find_one({
                "owner_id": user_id,
                "platform": "telegram",
                "external_id": str(event.message.id),
            })
            if existing:
                return

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
                "sent_at": event.message.date or datetime.utcnow(),
                "created_at": datetime.utcnow(),
            }
            await db.messages.insert_one(doc)

            # Also create a notification
            await db.notifications.insert_one({
                "owner_id": user_id,
                "type": "new_message",
                "title": f"Повідомлення від {contact.get('name', 'контакта')}",
                "body": (event.message.message or "")[:200],
                "contact_id": contact_id,
                "read": False,
                "platform": "telegram",
                "created_at": datetime.utcnow(),
            })

            # Publish to WebSocket
            await _publish_new_message(redis_client, user_id, {
                "contact_id": contact_id,
                "contact_name": contact.get("name", ""),
                "contact_avatar": contact.get("avatar_url", ""),
                "platform": "telegram",
                "content": event.message.message or "",
                "sent_at": event.message.date.isoformat() if event.message.date else datetime.utcnow().isoformat(),
            })

            log.info(f"New message for user {user_id} from contact {contact.get('name')}")

        active_clients[user_id] = (client, session_str)
        asyncio.create_task(_watch_disconnect(user_id, client))
    except Exception as e:
        log.error(f"Failed to attach {user_id}: {e}")
        try:
            await client.disconnect()
        except Exception:
            pass


async def scan_and_attach_users(redis_client):
    """Find all users with connected Telegram, attach new ones, drop stale ones,
    and rotate clients whose session string changed or whose connection died."""
    db = get_db()
    seen: set[str] = set()

    async for user in db.users.find({"integrations.telegram.connected": True}):
        user_id = str(user["_id"])
        session = user.get("integrations", {}).get("telegram", {}).get("session", "")
        if not session:
            continue
        seen.add(user_id)

        current = active_clients.get(user_id)
        if current:
            client, old_session = current
            # Re-attach if session was rotated in DB, the socket died,
            # or the auth key got invalidated server-side (Telethon can
            # silently reconnect forever without raising, so we actively
            # probe authorization here).
            alive = old_session == session and client.is_connected()
            if alive:
                try:
                    alive = await asyncio.wait_for(client.is_user_authorized(), timeout=10)
                except Exception:
                    alive = False
            if alive:
                continue
            log.warning(f"[{user_id}] Client is stale — detaching")
            await _detach_user(user_id)

        await _attach_user(user_id, session, redis_client)

    # Drop listeners for users who disconnected Telegram in the UI
    for stale_user_id in list(active_clients.keys()):
        if stale_user_id not in seen:
            await _detach_user(stale_user_id)


async def main():
    log.info("Starting Telegram listener")
    await connect_db()
    redis_client = aioredis.from_url(settings.REDIS_URL)

    # Initial scan
    await scan_and_attach_users(redis_client)
    log.info(f"Attached {len(active_clients)} listeners")

    # Re-scan every 15 seconds — picks up newly connected users quickly
    # and recovers from dropped/rotated sessions without a container restart.
    try:
        while True:
            await asyncio.sleep(15)
            await scan_and_attach_users(redis_client)
    except asyncio.CancelledError:
        log.info("Shutdown requested")
    finally:
        for client, _ in active_clients.values():
            try:
                await client.disconnect()
            except Exception:
                pass
        await close_db()
        await redis_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
