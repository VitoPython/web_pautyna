"""Contact enrichment via Unipile.

For every platform linkage on the contact we combine data from two Unipile
endpoints — /chat_attendees/{attendee_id} and /users/{provider_id} — and
fill blank fields on the contact. Only fills blanks; never overwrites
what the user typed. Returns diagnostics so the UI can explain what was
possible and what wasn't (Telegram, for example, has no job/company data).
"""

from __future__ import annotations

import logging
from datetime import datetime

from bson import ObjectId

log = logging.getLogger(__name__)


def _first(*candidates) -> str:
    for v in candidates:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _extract_company(source: dict) -> str:
    """Pull company name from the various shapes Unipile uses across providers."""
    if not isinstance(source, dict):
        return ""
    direct = _first(
        source.get("company_name"),
        source.get("current_company_name"),
    )
    if direct:
        return direct
    for key in ("current_company", "company", "employer"):
        nested = source.get(key)
        if isinstance(nested, dict):
            name = _first(nested.get("name"), nested.get("title"))
            if name:
                return name
        if isinstance(nested, str) and nested.strip():
            return nested.strip()
    # LinkedIn sometimes returns an array of positions.
    positions = source.get("positions") or source.get("experience") or []
    if isinstance(positions, list) and positions:
        first = positions[0]
        if isinstance(first, dict):
            return _first(
                first.get("company_name"),
                (first.get("company") or {}).get("name") if isinstance(first.get("company"), dict) else first.get("company"),
            )
    return ""


def _extract_headline(source: dict) -> str:
    if not isinstance(source, dict):
        return ""
    return _first(
        source.get("headline"),
        source.get("occupation"),
        source.get("title"),
        source.get("job_title"),
    )


def _extract_location(source: dict) -> str:
    if not isinstance(source, dict):
        return ""
    loc = source.get("location") or source.get("geo_location") or source.get("city")
    if isinstance(loc, dict):
        return _first(loc.get("name"), loc.get("city"), loc.get("country"))
    if isinstance(loc, str):
        return loc.strip()
    return ""


def _extract_profile_url(source: dict) -> str:
    if not isinstance(source, dict):
        return ""
    return _first(
        source.get("profile_url"),
        source.get("public_profile_url"),
        source.get("provider_url"),
        source.get("url"),
    )


async def enrich_contact(db, user_id: str, contact_id: str) -> dict:
    """Returns {"fields": [...], "sources": [...], "notes": [str]}.

    `notes` surfaces human-readable reasons we couldn't fill something, so
    the UI can tell the user e.g. "Telegram не надає job_title/company".
    """
    from app.services import unipile_service

    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
    if not contact:
        return {"fields": [], "sources": [], "notes": ["Contact not found"]}

    updates: dict = {}
    sources: list[str] = []
    notes: list[str] = []

    # Aggregate merged specifics so the richest-per-field wins.
    merged: dict = {}
    telegram_username = ""

    for plat in contact.get("platforms") or []:
        account_id = plat.get("account_id")
        attendee_id = plat.get("attendee_id")
        provider_id = plat.get("profile_id") or ""
        platform_type = (plat.get("type") or "").lower()

        if not account_id:
            continue

        attendee_data: dict = {}
        user_profile: dict = {}

        if attendee_id:
            try:
                attendee_data = await unipile_service.get_attendee(account_id, attendee_id)
            except Exception as e:
                log.warning(f"Enrich {contact_id}: get_attendee failed: {e}")

        # /users/<provider_id> is richer; works best for LinkedIn. Telegram
        # sometimes 404s — get_user_profile swallows that and returns {}.
        if provider_id:
            try:
                user_profile = await unipile_service.get_user_profile(account_id, provider_id)
            except Exception as e:
                log.warning(f"Enrich {contact_id}: get_user_profile failed: {e}")

        if not attendee_data and not user_profile:
            continue

        sources.append(platform_type)

        # Specifics may live at the top level of user_profile, or nested.
        specifics = {
            **(attendee_data.get("specifics") or {}),
            **(user_profile if isinstance(user_profile, dict) else {}),
            **(user_profile.get("specifics") or {} if isinstance(user_profile, dict) else {}),
        }
        merged.update(specifics)

        # Name — use whichever source has a better value.
        new_name = _first(attendee_data.get("name"), user_profile.get("name"), specifics.get("full_name"))
        current_name = (contact.get("name") or "").strip()
        if new_name and (not current_name or current_name == provider_id):
            updates["name"] = new_name

        # Avatar → our proxy.
        if not contact.get("avatar_url") and attendee_id:
            updates["avatar_url"] = f"/api/v1/unipile/avatar/{contact_id}"

        # ---- Platform-specific fills ----
        if platform_type == "linkedin":
            headline = _extract_headline(specifics)
            if headline and not contact.get("job_title"):
                updates["job_title"] = headline
            company = _extract_company(specifics)
            if company and not contact.get("company"):
                updates["company"] = company
            location = _extract_location(specifics)
            if location and not contact.get("location"):
                updates["location"] = location
            profile_url = _extract_profile_url(attendee_data) or _extract_profile_url(user_profile)
            if profile_url and not contact.get("website"):
                updates["website"] = profile_url

        if platform_type in ("telegram", "whatsapp"):
            phone = _first(specifics.get("phone"), specifics.get("phone_number"))
            if phone and not contact.get("phone"):
                updates["phone"] = phone
            username = _first(specifics.get("username"), specifics.get("handle"))
            if platform_type == "telegram" and username:
                telegram_username = username

        if platform_type in ("gmail", "google_oauth", "outlook", "email"):
            if provider_id and "@" in provider_id and not contact.get("email"):
                updates["email"] = provider_id

    # ---- Telegram username → notes ----
    if telegram_username:
        note_line = f"Telegram: @{telegram_username}"
        existing_notes = contact.get("notes") or ""
        if note_line not in existing_notes:
            updates["notes"] = (existing_notes + ("\n" if existing_notes else "") + note_line).strip()

    # ---- Diagnostics for the UI ----
    platform_types = {(p.get("type") or "").lower() for p in contact.get("platforms") or []}
    if platform_types == {"telegram"} and not any(
        f in updates for f in ("job_title", "company", "website")
    ):
        notes.append("Telegram не надає job_title / company / website — підключіть LinkedIn для цих полів.")
    if not sources:
        notes.append("Немає жодного Unipile account_id для цього контакту.")

    if updates:
        updates["updated_at"] = datetime.utcnow()
        await db.contacts.update_one({"_id": contact["_id"]}, {"$set": updates})

    return {
        "fields": [k for k in updates.keys() if k != "updated_at"],
        "sources": sorted(set(sources)),
        "notes": notes,
    }
