import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status

from app.core.database import get_db
from app.core.security import get_current_user_id

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/status")
async def get_integrations_status(user_id: str = Depends(get_current_user_id)):
    """Get connection status for all integrations."""
    db = get_db()
    user = await db.users.find_one({"_id": __import__("bson").ObjectId(user_id)})
    integrations = user.get("integrations", {}) if user else {}
    unipile_accounts = integrations.get("unipile", {}).get("accounts", [])

    def _has(provider: str) -> bool:
        return any(a.get("provider", "").lower() == provider and a.get("status") != "disconnected"
                   for a in unipile_accounts)

    return {
        "unipile_accounts": len(unipile_accounts),
        "gmail": {"connected": _has("google") or _has("gmail")},
        "telegram": {"connected": _has("telegram")},
        "linkedin": {"connected": _has("linkedin")},
        "instagram": {"connected": _has("instagram")},
        "whatsapp": {"connected": _has("whatsapp")},
        "calendar": {"connected": _has("google_calendar") or _has("outlook")},
    }


@router.post("/wipe-legacy")
async def wipe_legacy_integrations(user_id: str = Depends(get_current_user_id)):
    """One-way migration: nuke the Telethon/Google-direct integration data
    and all user-owned contacts/messages/notifications/pages/canvas nodes.

    Called once after switching to Unipile. Keeps the user account itself and
    any newly-connected Unipile accounts.
    """
    db = get_db()
    from bson import ObjectId
    uid = ObjectId(user_id)

    # Count what we're about to delete so the UI can show a summary.
    contacts_n = await db.contacts.count_documents({"owner_id": user_id})
    messages_n = await db.messages.count_documents({"owner_id": user_id})
    notifs_n = await db.notifications.count_documents({"owner_id": user_id})
    pages_n = await db.pages.count_documents({"owner_id": user_id})

    await db.contacts.delete_many({"owner_id": user_id})
    await db.messages.delete_many({"owner_id": user_id})
    await db.notifications.delete_many({"owner_id": user_id})
    await db.pages.delete_many({"owner_id": user_id})
    await db.actions.delete_many({"owner_id": user_id})
    await db.failed_actions.delete_many({"owner_id": user_id})

    # Reset the user's canvas (keep the doc, clear nodes).
    await db.canvases.update_one(
        {"owner_id": user_id},
        {"$set": {"nodes": []}},
    )

    # Strip legacy per-platform integration data; preserve unipile subdoc.
    existing_unipile = {}
    user = await db.users.find_one({"_id": uid})
    if user:
        existing_unipile = user.get("integrations", {}).get("unipile", {})

    await db.users.update_one(
        {"_id": uid},
        {"$set": {"integrations": {"unipile": existing_unipile} if existing_unipile else {}}},
    )

    return {
        "wiped": {
            "contacts": contacts_n,
            "messages": messages_n,
            "notifications": notifs_n,
            "pages": pages_n,
        },
    }


@router.post("/csv/upload")
async def upload_csv(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Upload CSV file and import contacts into the web."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл має бути у форматі CSV",
        )

    content = await file.read()

    # Try different encodings
    text = None
    for encoding in ["utf-8", "utf-8-sig", "cp1251", "latin-1"]:
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if text is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не вдалося прочитати файл. Перевірте кодування.",
        )

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV файл порожній або не має заголовків",
        )

    db = get_db()
    canvas = await db.canvases.find_one({"owner_id": user_id})
    if not canvas:
        raise HTTPException(status_code=404, detail="Canvas not found")

    imported = 0
    skipped = 0
    now = datetime.utcnow()

    # Map common column names
    name_fields = ["name", "Name", "ім'я", "Ім'я", "імя", "ПІБ", "full_name", "Full Name", "fullname", "contact"]
    email_fields = ["email", "Email", "E-mail", "e-mail", "пошта", "Пошта", "mail"]
    phone_fields = ["phone", "Phone", "телефон", "Телефон", "mobile", "Mobile"]
    tag_fields = ["tags", "Tags", "теги", "Теги", "category", "Category", "група", "Група"]
    platform_fields = ["platform", "Platform", "платформа", "source", "Source"]
    profile_fields = ["profile", "Profile", "profile_url", "url", "URL", "link", "Link"]

    def find_field(row: dict, candidates: list[str]) -> str:
        for f in candidates:
            if f in row and row[f] and row[f].strip():
                return row[f].strip()
        return ""

    for row in reader:
        name = find_field(row, name_fields)
        if not name:
            skipped += 1
            continue

        email = find_field(row, email_fields)
        phone = find_field(row, phone_fields)
        tags_raw = find_field(row, tag_fields)
        platform = find_field(row, platform_fields).lower()
        profile_id = find_field(row, profile_fields)

        # Parse tags
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []

        # Build platforms list
        platforms = []
        if platform and profile_id:
            platforms.append({
                "type": platform,
                "profile_id": profile_id,
                "profile_url": profile_id if profile_id.startswith("http") else "",
                "connected_at": now,
            })

        # Check for duplicate by name + owner
        existing = await db.contacts.find_one({"owner_id": user_id, "name": name})
        if existing:
            skipped += 1
            continue

        contact_doc = {
            "owner_id": user_id,
            "name": name,
            "avatar_url": "",
            "platforms": platforms,
            "tags": tags,
            "position": {"x": 0, "y": 0},
            "extra": {},
            "created_at": now,
        }

        if email:
            contact_doc["extra"]["email"] = email
        if phone:
            contact_doc["extra"]["phone"] = phone

        result = await db.contacts.insert_one(contact_doc)
        contact_id = str(result.inserted_id)

        # Add node to canvas
        await db.canvases.update_one(
            {"_id": canvas["_id"]},
            {"$push": {"nodes": {
                "contact_id": contact_id,
                "x": 0,
                "y": 0,
                "is_center": False,
            }}},
        )

        imported += 1

    return {
        "imported": imported,
        "skipped": skipped,
        "total": imported + skipped,
        "columns_detected": list(reader.fieldnames) if reader.fieldnames else [],
    }


@router.post("/csv/preview")
async def preview_csv(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Preview first rows of CSV without importing."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Файл має бути у форматі CSV")

    content = await file.read()
    text = None
    for encoding in ["utf-8", "utf-8-sig", "cp1251", "latin-1"]:
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    if text is None:
        raise HTTPException(status_code=400, detail="Не вдалося прочитати файл")

    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for i, row in enumerate(reader):
        if i >= 5:
            break
        rows.append(dict(row))

    return {
        "columns": list(reader.fieldnames) if reader.fieldnames else [],
        "preview": rows,
        "total_hint": len(text.strip().split("\n")) - 1,
    }
