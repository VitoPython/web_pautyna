"""Gmail / Google OAuth integration.

Handles:
- OAuth2 flow (authorization URL → callback → tokens)
- Import Google Contacts (People API)
- Read Gmail messages for a contact
- Send Gmail messages
"""

import base64
import os
from datetime import datetime
from email.mime.text import MIMEText

# Disable HTTPS requirement for local development
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
# Disable scope change warning
os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from app.core.config import settings
from app.core.database import get_db

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


def _create_flow(state: str = "") -> Flow:
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
            }
        },
        scopes=SCOPES,
        state=state,
    )
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    return flow


def get_auth_url(user_id: str) -> str:
    """Generate Google OAuth authorization URL."""
    flow = _create_flow(state=user_id)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


async def handle_callback(code: str, user_id: str) -> dict:
    """Exchange authorization code for tokens and save to DB."""
    flow = _create_flow(state=user_id)
    flow.fetch_token(code=code)
    creds = flow.credentials

    # Get user info
    service = build("oauth2", "v2", credentials=creds)
    user_info = service.userinfo().get().execute()

    # Save tokens to MongoDB
    db = get_db()
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or []),
    }

    await db.users.update_one(
        {"_id": __import__("bson").ObjectId(user_id)},
        {"$set": {
            "integrations.gmail.connected": True,
            "integrations.gmail.email": user_info.get("email", ""),
            "integrations.gmail.name": user_info.get("name", ""),
            "integrations.gmail.picture": user_info.get("picture", ""),
            "integrations.gmail.tokens": token_data,
        }},
    )

    return {
        "email": user_info.get("email"),
        "name": user_info.get("name"),
    }


async def _get_credentials(user_id: str) -> Credentials:
    """Load credentials from MongoDB."""
    db = get_db()
    user = await db.users.find_one({"_id": __import__("bson").ObjectId(user_id)})
    tokens = user.get("integrations", {}).get("gmail", {}).get("tokens")
    if not tokens:
        raise ValueError("Gmail not connected")

    creds = Credentials(
        token=tokens["token"],
        refresh_token=tokens.get("refresh_token"),
        token_uri=tokens.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=tokens.get("client_id", settings.GOOGLE_CLIENT_ID),
        client_secret=tokens.get("client_secret", settings.GOOGLE_CLIENT_SECRET),
        scopes=tokens.get("scopes", SCOPES),
    )

    # Refresh if expired
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        # Save refreshed token
        await db.users.update_one(
            {"_id": __import__("bson").ObjectId(user_id)},
            {"$set": {"integrations.gmail.tokens.token": creds.token}},
        )

    return creds


def _parse_person(person: dict) -> dict | None:
    """Parse a Google People API person into a simple dict."""
    names = person.get("names", [])
    if not names:
        return None
    name = names[0].get("displayName", "")
    if not name:
        return None

    emails = person.get("emailAddresses", [])
    email = emails[0].get("value", "") if emails else ""
    phones = person.get("phoneNumbers", [])
    phone = phones[0].get("value", "") if phones else ""
    photos = person.get("photos", [])
    avatar = photos[0].get("url", "") if photos else ""
    orgs = person.get("organizations", [])
    company = orgs[0].get("name", "") if orgs else ""
    job_title = orgs[0].get("title", "") if orgs else ""
    resource_name = person.get("resourceName", "")

    return {
        "google_id": resource_name,
        "name": name,
        "email": email,
        "phone": phone,
        "avatar": avatar,
        "company": company,
        "job_title": job_title,
    }


async def list_contacts(user_id: str, query: str = "") -> list[dict]:
    """List Google contacts for selection without importing."""
    creds = await _get_credentials(user_id)
    service = build("people", "v1", credentials=creds)

    results = service.people().connections().list(
        resourceName="people/me",
        pageSize=500,
        personFields="names,emailAddresses,phoneNumbers,photos,organizations",
    ).execute()

    connections = results.get("connections", [])
    db = get_db()
    q = query.lower().strip()
    contacts = []

    for person in connections:
        parsed = _parse_person(person)
        if not parsed:
            continue

        if q and q not in parsed["name"].lower() and q not in parsed["email"].lower() and q not in parsed["company"].lower():
            continue

        # Check if already imported
        existing = None
        if parsed["email"]:
            existing = await db.contacts.find_one({"owner_id": user_id, "email": parsed["email"]})
        if not existing:
            existing = await db.contacts.find_one({"owner_id": user_id, "name": parsed["name"], "platforms.type": "gmail"})

        contacts.append({
            **parsed,
            "already_imported": existing is not None,
        })

    return contacts


async def import_selected(user_id: str, google_ids: list[str]) -> dict:
    """Import only selected Google contacts."""
    creds = await _get_credentials(user_id)
    service = build("people", "v1", credentials=creds)

    results = service.people().connections().list(
        resourceName="people/me",
        pageSize=500,
        personFields="names,emailAddresses,phoneNumbers,photos,organizations",
    ).execute()

    selected_set = set(google_ids)
    db = get_db()
    now = datetime.utcnow()
    imported = 0
    skipped = 0

    for person in results.get("connections", []):
        parsed = _parse_person(person)
        if not parsed or parsed["google_id"] not in selected_set:
            continue

        # Duplicate check
        if parsed["email"]:
            existing = await db.contacts.find_one({"owner_id": user_id, "email": parsed["email"]})
        else:
            existing = await db.contacts.find_one({"owner_id": user_id, "name": parsed["name"], "platforms.type": "gmail"})
        if existing:
            skipped += 1
            continue

        contact_doc = {
            "owner_id": user_id,
            "name": parsed["name"],
            "avatar_url": parsed["avatar"],
            "email": parsed["email"],
            "phone": parsed["phone"],
            "job_title": parsed["job_title"],
            "company": parsed["company"],
            "website": "",
            "platforms": [{"type": "gmail", "profile_id": parsed["email"], "profile_url": "", "connected_at": now}] if parsed["email"] else [],
            "tags": ["google"],
            "position": {"x": 0, "y": 0},
            "created_at": now,
        }

        res = await db.contacts.insert_one(contact_doc)
        canvas = await db.canvases.find_one({"owner_id": user_id})
        if canvas:
            await db.canvases.update_one(
                {"_id": canvas["_id"]},
                {"$push": {"nodes": {"contact_id": str(res.inserted_id), "x": 0, "y": 0, "is_center": False}}},
            )
        imported += 1

    return {"imported": imported, "skipped": skipped}


async def get_messages(user_id: str, contact_email: str, max_results: int = 20) -> list[dict]:
    """Get Gmail messages exchanged with a specific contact."""
    creds = await _get_credentials(user_id)
    service = build("gmail", "v1", credentials=creds)

    query = f"from:{contact_email} OR to:{contact_email}"
    results = service.users().messages().list(
        userId="me", q=query, maxResults=max_results
    ).execute()

    messages = []
    for msg_ref in results.get("messages", []):
        msg = service.users().messages().get(
            userId="me", id=msg_ref["id"], format="metadata",
            metadataHeaders=["From", "To", "Subject", "Date"],
        ).execute()

        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        messages.append({
            "id": msg["id"],
            "from": headers.get("From", ""),
            "to": headers.get("To", ""),
            "subject": headers.get("Subject", ""),
            "date": headers.get("Date", ""),
            "snippet": msg.get("snippet", ""),
        })

    return messages


async def send_message(user_id: str, to_email: str, subject: str, body: str) -> dict:
    """Send an email via Gmail."""
    creds = await _get_credentials(user_id)
    service = build("gmail", "v1", credentials=creds)

    message = MIMEText(body)
    message["to"] = to_email
    message["subject"] = subject

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    result = service.users().messages().send(
        userId="me", body={"raw": raw}
    ).execute()

    return {"id": result["id"], "status": "sent"}


async def disconnect(user_id: str):
    """Disconnect Gmail."""
    db = get_db()
    await db.users.update_one(
        {"_id": __import__("bson").ObjectId(user_id)},
        {"$set": {
            "integrations.gmail.connected": False,
            "integrations.gmail.tokens": None,
            "integrations.gmail.email": "",
        }},
    )
