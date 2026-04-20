"""Messaging endpoints — now backed by Unipile for all platforms.

Unipile is the source of truth for chats and live messages. We cache messages
into MongoDB as they're fetched, so history browsing stays snappy and webhooks
can update state without a round-trip. Contacts are auto-upserted from chat
attendees on first sync.
"""

from datetime import datetime
import logging

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.message import MessageSend
from app.services import unipile_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/messages", tags=["messages"])


def _is_personal_active(chat: dict) -> bool:
    """Filter: only 1-to-1 DMs that are not muted. Unipile represents muted
    chats with a `muted_until` string in the future (for Telegram, muted-
    forever is `Tue Jan 19 2038...`). Non-muted chats have `muted_until: None`."""
    if chat.get("type") != 0:  # 0 = personal, 2 = group/channel
        return False
    if chat.get("muted_until"):
        return False
    return True


async def _user_unipile_accounts(db, user_id: str) -> list[dict]:
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return []
    return user.get("integrations", {}).get("unipile", {}).get("accounts", []) or []


async def _upsert_contact_from_chat(db, user_id: str, chat: dict) -> str:
    """Ensure a contact exists for this DM. Returns contact_id."""
    account_id = chat.get("account_id", "")
    chat_id = chat.get("id", "")
    attendee = str(chat.get("attendee_provider_id") or "")
    platform_type = (chat.get("account_type") or "").lower()

    existing = await db.contacts.find_one({
        "owner_id": user_id,
        "platforms.chat_id": chat_id,
    })
    if existing:
        updates: dict = {}
        if existing.get("name") != chat.get("name"):
            updates["name"] = chat.get("name", existing.get("name", ""))
        # Backfill attendee_id on legacy contacts created before avatar support.
        plat0 = (existing.get("platforms") or [{}])[0]
        if not plat0.get("attendee_id"):
            try:
                attendees = await unipile_service.get_chat_attendees_for_chat(chat_id)
                if attendees:
                    updates["platforms.0.attendee_id"] = attendees[0].get("id", "")
            except Exception as e:
                log.warning(f"Attendee lookup failed for chat {chat_id}: {e}")
        if updates:
            await db.contacts.update_one({"_id": existing["_id"]}, {"$set": updates})
        return str(existing["_id"])

    # New contact — fetch attendee_id so we can serve the avatar later.
    attendee_id = ""
    try:
        attendees = await unipile_service.get_chat_attendees_for_chat(chat_id)
        if attendees:
            attendee_id = attendees[0].get("id", "")
    except Exception as e:
        log.warning(f"Attendee lookup failed for chat {chat_id}: {e}")

    now = datetime.utcnow()
    doc = {
        "owner_id": user_id,
        "name": chat.get("name", ""),
        "avatar_url": "",
        "email": "",
        "phone": "",
        "job_title": "",
        "company": "",
        "website": "",
        "source": "unipile",
        "platforms": [{
            "type": platform_type,
            "profile_id": attendee,
            "chat_id": chat_id,
            "account_id": account_id,
            "attendee_id": attendee_id,
            "connected_at": now,
        }],
        "tags": [platform_type] if platform_type else [],
        "position": {"x": 0, "y": 0},
        "created_at": now,
    }
    res = await db.contacts.insert_one(doc)
    contact_id = str(res.inserted_id)

    canvas = await db.canvases.find_one({"owner_id": user_id})
    if canvas:
        await db.canvases.update_one(
            {"_id": canvas["_id"]},
            {"$push": {"nodes": {"contact_id": contact_id, "x": 0, "y": 0, "is_center": False}}},
        )
    return contact_id


def _chat_platform_info(contact: dict) -> dict | None:
    """Return the first Unipile-backed platform entry, or None."""
    for p in contact.get("platforms", []):
        if p.get("chat_id") and p.get("account_id"):
            return p
    return None


EMAIL_PROVIDER_TYPES = {"gmail", "google_oauth", "outlook", "email"}


def _email_platform_info(contact: dict) -> dict | None:
    """Return the first email-backed Unipile platform entry, or None."""
    for p in contact.get("platforms", []):
        if (p.get("type") or "").lower() in EMAIL_PROVIDER_TYPES and p.get("account_id"):
            return p
    return None


async def _upsert_contact_from_email(db, user_id: str, email: dict, account_id: str, platform_type: str) -> str | None:
    """Ensure a contact exists for the email's external party (the non-self
    side of the conversation). Returns contact_id or None if we can't tell
    who the other party is (e.g. no from_attendee)."""
    from_att = email.get("from_attendee") or {}
    to_atts = email.get("to_attendees") or []
    is_sender = email.get("role") == "sent" or (
        # Some payloads mark sent items with folders/labels
        any("sent" in (f or "").lower() for f in (email.get("folders") or []))
    )

    # For inbound emails, the "contact" is the sender; for outbound, it's
    # the first recipient we don't match as self.
    party = from_att if not is_sender else (to_atts[0] if to_atts else from_att)
    addr = (party.get("identifier") or "").lower().strip()
    if not addr or "@" not in addr:
        return None

    display = party.get("display_name") or addr
    existing = await db.contacts.find_one({
        "owner_id": user_id,
        "platforms.type": platform_type,
        "platforms.profile_id": addr,
    })
    if existing:
        # Keep display name fresh.
        if existing.get("name") != display and display != addr:
            await db.contacts.update_one(
                {"_id": existing["_id"]},
                {"$set": {"name": display}},
            )
        return str(existing["_id"])

    now = datetime.utcnow()
    doc = {
        "owner_id": user_id,
        "name": display,
        "avatar_url": "",
        "email": addr,
        "phone": "",
        "job_title": "",
        "company": "",
        "website": "",
        "source": "unipile",
        "platforms": [{
            "type": platform_type,
            "profile_id": addr,
            "account_id": account_id,
            "connected_at": now,
        }],
        "tags": ["email"],
        "position": {"x": 0, "y": 0},
        "created_at": now,
    }
    res = await db.contacts.insert_one(doc)
    contact_id = str(res.inserted_id)

    canvas = await db.canvases.find_one({"owner_id": user_id})
    if canvas:
        await db.canvases.update_one(
            {"_id": canvas["_id"]},
            {"$push": {"nodes": {"contact_id": contact_id, "x": 0, "y": 0, "is_center": False}}},
        )
    return contact_id


# ─── Chats ───────────────────────────────────────────────────────────

async def _list_email_chats(db, user_id: str, account_id: str, provider: str) -> list[dict]:
    """Pull recent emails for an email-type account and group them by the
    other party's address — each unique correspondent becomes an inbox row."""
    try:
        data = await unipile_service.list_emails(account_id=account_id, limit=80)
    except Exception as e:
        log.warning(f"Unipile list_emails({account_id}) failed: {e}")
        return []

    # Group by correspondent address; keep newest timestamp + unread count per group.
    groups: dict[str, dict] = {}
    for email in data.get("items", []):
        contact_id = await _upsert_contact_from_email(db, user_id, email, account_id, provider)
        if not contact_id:
            continue
        ts = email.get("date", "")
        is_unread = not email.get("read_date")
        g = groups.setdefault(contact_id, {
            "contact_id": contact_id,
            "last_sent_at": ts,
            "subject": email.get("subject", ""),
            "preview": (email.get("body_plain") or email.get("subject", ""))[:120],
            "unread": 0,
        })
        if ts and ts > (g["last_sent_at"] or ""):
            g["last_sent_at"] = ts
            g["subject"] = email.get("subject", "")
            g["preview"] = (email.get("body_plain") or email.get("subject", ""))[:120]
        if is_unread:
            g["unread"] += 1

    rows = []
    for contact_id, g in groups.items():
        contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
        if not contact:
            continue
        rows.append({
            "contact_id": contact_id,
            "chat_id": "",  # emails have no chat_id — thread-less inbox view
            "account_id": account_id,
            "contact_name": contact.get("name", "") or contact.get("email", ""),
            "contact_avatar": "",
            "platform": provider,
            "last_message": g["preview"] or g["subject"],
            "last_direction": "",
            "last_sent_at": g["last_sent_at"],
            "unread_count": g["unread"],
            "total": 0,
        })
    return rows


@router.get("/chats")
async def list_chats(user_id: str = Depends(get_current_user_id)):
    """List personal (1-to-1), non-muted chats from all connected Unipile accounts."""
    db = get_db()
    accounts = await _user_unipile_accounts(db, user_id)

    chats_out: list[dict] = []
    for acc in accounts:
        account_id = acc.get("account_id", "")
        provider = (acc.get("provider") or "").lower()
        if not account_id:
            continue

        # Route by provider kind — email vs chat-based platforms use different
        # Unipile endpoints under the hood.
        if provider in EMAIL_PROVIDER_TYPES:
            chats_out.extend(await _list_email_chats(db, user_id, account_id, provider))
            continue

        try:
            data = await unipile_service.list_chats(account_id=account_id, limit=100)
        except Exception as e:
            log.warning(f"Unipile list_chats({account_id}) failed: {e}")
            continue

        # For chats with unread messages, sync them now so new messages land
        # in Mongo and notifications fire even when the user is not viewing
        # that specific chat. Without webhooks (local dev) this is the only
        # way to get near-real-time notifications.
        unread_chats: list[tuple[dict, str]] = []

        for chat in data.get("items", []):
            if not _is_personal_active(chat):
                continue
            contact_id = await _upsert_contact_from_chat(db, user_id, chat)
            if (chat.get("unread_count") or 0) > 0:
                unread_chats.append((chat, contact_id))

        # Fan-out sync for unread chats in parallel — most users have < 10
        # active unread threads at once, so this stays cheap.
        if unread_chats:
            import asyncio
            contacts_by_id = {
                str(c["_id"]): c for c in await db.contacts.find(
                    {"owner_id": user_id, "_id": {"$in": [ObjectId(cid) for _, cid in unread_chats]}}
                ).to_list(len(unread_chats))
            }
            await asyncio.gather(*[
                _sync_messages_from_unipile(db, user_id, contacts_by_id[cid], limit=20)
                for _, cid in unread_chats if cid in contacts_by_id
            ], return_exceptions=True)

        for chat in data.get("items", []):
            if not _is_personal_active(chat):
                continue
            contact_id = await _upsert_contact_from_chat(db, user_id, chat)

            cached = await db.messages.find_one(
                {"owner_id": user_id, "contact_id": contact_id},
                sort=[("sent_at", -1)],
            )

            # Point at our proxy avatar endpoint; frontend handles 404 by
            # falling back to the initial letter.
            chats_out.append({
                "contact_id": contact_id,
                "chat_id": chat.get("id", ""),
                "account_id": account_id,
                "contact_name": chat.get("name", ""),
                "contact_avatar": f"/api/v1/unipile/avatar/{contact_id}",
                "platform": (chat.get("account_type") or "").lower(),
                "last_message": (cached or {}).get("content", "") if cached else "",
                "last_direction": (cached or {}).get("direction", "") if cached else "",
                "last_sent_at": chat.get("timestamp", ""),
                "unread_count": chat.get("unread_count", 0) or 0,
                "total": 0,
            })

    chats_out.sort(key=lambda c: c.get("last_sent_at") or "", reverse=True)
    return chats_out


# ─── Messages with a specific contact ────────────────────────────────

async def _sync_email_messages(db, user_id: str, contact: dict, plat: dict, limit: int = 30) -> None:
    """Pull recent emails with this contact and upsert into Mongo as messages.

    Messages collection is shared with chat platforms — we just tag
    platform="gmail" (or whatever) and store subject/body separately.
    """
    email_addr = plat.get("profile_id") or contact.get("email", "")
    if not email_addr:
        return
    account_id = plat["account_id"]

    try:
        data = await unipile_service.list_emails(
            account_id=account_id, limit=limit, from_address=email_addr
        )
    except Exception as e:
        log.warning(f"Unipile list_emails({account_id}, {email_addr}) failed: {e}")
        return

    for em in data.get("items", []):
        external_id = em.get("id", "")
        if not external_id:
            continue
        existing = await db.messages.find_one({
            "owner_id": user_id,
            "platform": plat.get("type", ""),
            "external_id": external_id,
        })
        if existing:
            continue

        from_att = em.get("from_attendee") or {}
        from_addr = (from_att.get("identifier") or "").lower()
        direction = "outbound" if from_addr and from_addr != email_addr else "inbound"

        dt_str = em.get("date", "")
        sent_at = datetime.utcnow()
        if dt_str:
            try:
                sent_at = datetime.fromisoformat(dt_str.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                pass

        await db.messages.insert_one({
            "owner_id": user_id,
            "contact_id": str(contact["_id"]),
            "platform": plat.get("type", ""),
            "direction": direction,
            "content": em.get("body_plain") or em.get("body", "") or em.get("subject", ""),
            "subject": em.get("subject", ""),
            "media_urls": [a.get("url", "") for a in (em.get("attachments") or []) if a.get("url")],
            "external_id": external_id,
            "read": direction == "outbound" or bool(em.get("read_date")),
            "sent_at": sent_at,
            "created_at": datetime.utcnow(),
        })

        if direction == "inbound" and not em.get("read_date"):
            from app.services.campaign_replies import mark_campaign_replies
            await mark_campaign_replies(db, user_id, str(contact["_id"]))
            await db.notifications.insert_one({
                "owner_id": user_id,
                "type": "new_message",
                "title": f"Лист від {contact.get('name') or email_addr}",
                "body": (em.get("subject") or "")[:200],
                "contact_id": str(contact["_id"]),
                "read": False,
                "platform": plat.get("type", ""),
                "created_at": datetime.utcnow(),
            })
            from app.services.realtime import publish_event
            await publish_event(user_id, "new_message", {
                "contact_id": str(contact["_id"]),
                "contact_name": contact.get("name", ""),
                "contact_avatar": contact.get("avatar_url", ""),
                "platform": plat.get("type", ""),
                "content": em.get("subject") or "",
                "sent_at": sent_at.isoformat(),
            })


async def _sync_messages_from_unipile(db, user_id: str, contact: dict, limit: int = 50) -> None:
    """Pull latest messages for this contact and upsert into Mongo.

    Routes to chat-based or email-based sync depending on the contact's
    platform metadata.
    """
    chat_plat = _chat_platform_info(contact)
    email_plat = _email_platform_info(contact) if not chat_plat else None

    if email_plat and not chat_plat:
        return await _sync_email_messages(db, user_id, contact, email_plat, limit=min(limit, 30))

    if not chat_plat:
        return

    plat = chat_plat
    chat_id = plat["chat_id"]
    platform = plat.get("type") or ""

    try:
        data = await unipile_service.get_chat_messages(chat_id=chat_id, limit=limit)
    except Exception as e:
        log.warning(f"Unipile get_chat_messages({chat_id}) failed: {e}")
        return

    for m in data.get("items", []):
        external_id = m.get("id", "")
        if not external_id:
            continue

        # Skip service events (joined/left chat, pinned msg, etc.) and
        # deleted/hidden messages.
        if m.get("is_event") or m.get("deleted") or m.get("hidden"):
            continue

        text = (m.get("text") or "").strip()
        attachments = m.get("attachments") or []

        # Skip truly empty messages (no text, no attachments). These are
        # typically reactions or edit artifacts that came through as their
        # own "message" entries.
        if not text and not attachments:
            continue

        existing = await db.messages.find_one({
            "owner_id": user_id,
            "platform": platform,
            "external_id": external_id,
        })
        if existing:
            continue

        direction = "outbound" if m.get("is_sender") else "inbound"
        timestamp = m.get("timestamp", "")
        sent_at = datetime.utcnow()
        if timestamp:
            try:
                sent_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                pass

        media_urls = [a.get("url", "") for a in attachments if a.get("url")]

        # If the message is attachment-only, give the UI something to render.
        # Label per the first attachment's type.
        if not text and attachments:
            first_type = (attachments[0].get("type") or "media").lower()
            type_labels = {
                "img": "📷 Фото",
                "image": "📷 Фото",
                "video": "🎬 Відео",
                "audio": "🎵 Аудіо",
                "voice": "🎤 Голосове",
                "file": "📎 Файл",
                "sticker": "💬 Стікер",
                "gif": "🎞 GIF",
            }
            text = type_labels.get(first_type, f"📎 {first_type}")

        await db.messages.insert_one({
            "owner_id": user_id,
            "contact_id": str(contact["_id"]),
            "platform": platform,
            "direction": direction,
            "content": text,
            "subject": "",
            "media_urls": media_urls,
            "external_id": external_id,
            "read": direction == "outbound" or bool(m.get("seen")),
            "sent_at": sent_at,
            "created_at": datetime.utcnow(),
        })

        # Fire a notification for fresh unread inbound messages. Skip ones
        # that Unipile says are already seen (old history fetched on first
        # sync) — we only want to alert on genuinely new chatter.
        if direction == "inbound" and not m.get("seen"):
            from app.services.campaign_replies import mark_campaign_replies
            await mark_campaign_replies(db, user_id, str(contact["_id"]))
            await db.notifications.insert_one({
                "owner_id": user_id,
                "type": "new_message",
                "title": f"Повідомлення від {contact.get('name', 'контакта')}",
                "body": text[:200],
                "contact_id": str(contact["_id"]),
                "read": False,
                "platform": platform,
                "created_at": datetime.utcnow(),
            })
            from app.services.realtime import publish_event
            await publish_event(user_id, "new_message", {
                "contact_id": str(contact["_id"]),
                "contact_name": contact.get("name", ""),
                "contact_avatar": contact.get("avatar_url", ""),
                "platform": platform,
                "content": text,
                "sent_at": sent_at.isoformat() if hasattr(sent_at, "isoformat") else "",
            })


@router.get("/contact/{contact_id}")
async def list_messages_by_contact(
    contact_id: str,
    limit: int = 100,
    user_id: str = Depends(get_current_user_id),
):
    """Get messages with a specific contact. Refreshes from Unipile first."""
    db = get_db()
    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    await _sync_messages_from_unipile(db, user_id, contact, limit=limit)

    # Take the N newest (sort desc + limit), then flip to ascending so the
    # chat view renders oldest→newest. Plain sort asc + limit would truncate
    # the newest messages if the cache has more than `limit` entries.
    messages = await db.messages.find(
        {"owner_id": user_id, "contact_id": contact_id}
    ).sort("sent_at", -1).to_list(limit)
    messages.reverse()
    for m in messages:
        m["_id"] = str(m["_id"])

    await db.messages.update_many(
        {"owner_id": user_id, "contact_id": contact_id, "direction": "inbound", "read": False},
        {"$set": {"read": True}},
    )

    return messages


@router.post("/contact/{contact_id}/sync")
async def sync_contact_messages(contact_id: str, user_id: str = Depends(get_current_user_id)):
    """Force-refresh messages for this contact from Unipile."""
    db = get_db()
    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    await _sync_messages_from_unipile(db, user_id, contact, limit=100)
    return {"ok": True}


# ─── Send ────────────────────────────────────────────────────────────

@router.post("/send", status_code=201)
async def send_message(data: MessageSend, user_id: str = Depends(get_current_user_id)):
    """Send via Unipile, persist the outbound message locally."""
    db = get_db()
    contact = await db.contacts.find_one({"_id": ObjectId(data.contact_id), "owner_id": user_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    chat_plat = _chat_platform_info(contact)
    email_plat = _email_platform_info(contact) if not chat_plat else None

    now = datetime.utcnow()
    external_id: str = ""
    platform_type = ""

    if chat_plat:
        try:
            result = await unipile_service.send_message(chat_id=chat_plat["chat_id"], text=data.content)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Unipile: {e}")
        external_id = str(result.get("id") or result.get("message_id") or "")
        platform_type = chat_plat.get("type", "")

    elif email_plat:
        to_addr = email_plat.get("profile_id") or contact.get("email", "")
        if not to_addr:
            raise HTTPException(status_code=400, detail="Контакт не має email")
        try:
            result = await unipile_service.send_email(
                account_id=email_plat["account_id"],
                to=[to_addr],
                subject=data.subject or "(без теми)",
                body=data.content,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Unipile: {e}")
        external_id = str(result.get("id") or result.get("message_id") or "")
        platform_type = email_plat.get("type", "")

    else:
        raise HTTPException(status_code=400, detail="Контакт не має Unipile платформи для надсилання")

    msg_doc = {
        "owner_id": user_id,
        "contact_id": data.contact_id,
        "platform": platform_type,
        "direction": "outbound",
        "content": data.content,
        "subject": data.subject,
        "media_urls": [],
        "external_id": external_id,
        "read": True,
        "sent_at": now,
        "created_at": now,
    }
    res = await db.messages.insert_one(msg_doc)
    return {"id": str(res.inserted_id), "external_id": external_id}


# ─── Misc ────────────────────────────────────────────────────────────

@router.get("")
async def list_all_messages(
    platform: str | None = None,
    unread: bool = False,
    limit: int = 100,
    user_id: str = Depends(get_current_user_id),
):
    """Flat list of all cached messages. Used by notifications/search."""
    db = get_db()
    query: dict = {"owner_id": user_id}
    if platform:
        query["platform"] = platform
    if unread:
        query["read"] = False
        query["direction"] = "inbound"
    messages = await db.messages.find(query).sort("sent_at", -1).to_list(limit)
    for m in messages:
        m["_id"] = str(m["_id"])
    return messages


@router.patch("/{message_id}/read")
async def mark_read(message_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    result = await db.messages.update_one(
        {"_id": ObjectId(message_id), "owner_id": user_id},
        {"$set": {"read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    await db.messages.update_many(
        {"owner_id": user_id, "read": False},
        {"$set": {"read": True}},
    )
    return {"ok": True}
