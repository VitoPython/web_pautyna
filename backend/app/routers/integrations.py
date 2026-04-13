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

    return {
        "gmail": {
            "connected": bool(integrations.get("gmail", {}).get("connected")),
            "email": integrations.get("gmail", {}).get("email", ""),
        },
        "telegram": {
            "connected": bool(integrations.get("telegram", {}).get("connected")),
            "phone": integrations.get("telegram", {}).get("phone", ""),
        },
        "linkedin": {
            "connected": bool(integrations.get("linkedin", {}).get("connected")),
            "name": integrations.get("linkedin", {}).get("name", ""),
        },
        "instagram": {
            "connected": bool(integrations.get("instagram", {}).get("connected")),
            "username": integrations.get("instagram", {}).get("username", ""),
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
