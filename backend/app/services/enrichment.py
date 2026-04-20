"""Contact enrichment via Unipile's chat_attendees endpoint.

For every platform linkage on the contact that carries an attendee_id, we
fetch the attendee profile and copy useful fields (name, avatar, LinkedIn
headline/company) onto the contact. Only fills blanks by default — never
overwrites data the user entered manually.
"""

from __future__ import annotations

import logging
from datetime import datetime

from bson import ObjectId

log = logging.getLogger(__name__)


async def enrich_contact(db, user_id: str, contact_id: str) -> dict:
    """Returns {"fields": [...], "sources": [...]}.

    Safe to call repeatedly. Fetches Unipile attendee data for every platform
    linkage the contact has and fills empty fields on the contact document.
    """
    from app.services import unipile_service

    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
    if not contact:
        return {"fields": [], "sources": []}

    updates: dict = {}
    sources: list[str] = []

    for plat in contact.get("platforms") or []:
        account_id = plat.get("account_id")
        attendee_id = plat.get("attendee_id")
        if not (account_id and attendee_id):
            continue
        try:
            data = await unipile_service.get_attendee(account_id, attendee_id)
        except Exception as e:
            log.warning(f"Enrich {contact_id}: get_attendee failed: {e}")
            continue

        platform_type = (plat.get("type") or "").lower()
        sources.append(platform_type)

        # Name — only if our current name is empty or equals the profile_id handle.
        new_name = (data.get("name") or "").strip()
        current_name = (contact.get("name") or "").strip()
        if new_name and (not current_name or current_name == plat.get("profile_id")):
            updates["name"] = new_name

        # Avatar — if missing, point at our proxy so the image loads on demand.
        if not contact.get("avatar_url"):
            updates["avatar_url"] = f"/api/v1/unipile/avatar/{contact_id}"

        specifics = data.get("specifics") or {}

        # LinkedIn has the richest data — headline → job_title, current_company.
        if platform_type == "linkedin":
            headline = (specifics.get("headline") or "").strip()
            if headline and not contact.get("job_title"):
                updates["job_title"] = headline

            current_co = specifics.get("current_company") or specifics.get("company") or {}
            if isinstance(current_co, dict):
                co_name = (current_co.get("name") or "").strip()
                if co_name and not contact.get("company"):
                    updates["company"] = co_name

            occupation = (specifics.get("occupation") or "").strip()
            if occupation and not contact.get("job_title"):
                updates["job_title"] = occupation

            location = specifics.get("location") or specifics.get("geo_location") or ""
            if isinstance(location, str) and location and not contact.get("location"):
                updates["location"] = location

            # LinkedIn public profile URL
            provider_url = data.get("profile_url") or data.get("provider_url") or ""
            if provider_url and not contact.get("website"):
                updates["website"] = provider_url

        # For Telegram/WhatsApp we can pull phone numbers from specifics.
        if platform_type in ("telegram", "whatsapp"):
            phone = (specifics.get("phone") or specifics.get("phone_number") or "").strip()
            if phone and not contact.get("phone"):
                updates["phone"] = phone

        # For email providers — identifier is already the email address.
        if platform_type in ("gmail", "google_oauth", "outlook", "email"):
            addr = (plat.get("profile_id") or "").strip()
            if addr and "@" in addr and not contact.get("email"):
                updates["email"] = addr

    if updates:
        updates["updated_at"] = datetime.utcnow()
        await db.contacts.update_one({"_id": contact["_id"]}, {"$set": updates})

    return {"fields": list(updates.keys()), "sources": sources}
