"""LinkedIn OAuth integration (OpenID Connect).

LinkedIn API is limited — only provides:
- User profile (name, photo, email, headline)
- No access to connections or messages
"""

import urllib.parse

import httpx

from app.core.config import settings
from app.core.database import get_db

AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
SCOPES = "openid profile email"


def get_auth_url(user_id: str) -> str:
    params = {
        "response_type": "code",
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
        "state": user_id,
        "scope": SCOPES,
    }
    return f"{AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


async def handle_callback(code: str, user_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        # Exchange code for token
        token_resp = await client.post(TOKEN_URL, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
            "client_id": settings.LINKEDIN_CLIENT_ID,
            "client_secret": settings.LINKEDIN_CLIENT_SECRET,
        })
        token_resp.raise_for_status()
        token_data = token_resp.json()
        access_token = token_data["access_token"]

        # Get user profile
        profile_resp = await client.get(USERINFO_URL, headers={
            "Authorization": f"Bearer {access_token}",
        })
        profile_resp.raise_for_status()
        profile = profile_resp.json()

    name = profile.get("name", "")
    email = profile.get("email", "")
    picture = profile.get("picture", "")
    sub = profile.get("sub", "")

    db = get_db()
    await db.users.update_one(
        {"_id": __import__("bson").ObjectId(user_id)},
        {"$set": {
            "integrations.linkedin.connected": True,
            "integrations.linkedin.name": name,
            "integrations.linkedin.email": email,
            "integrations.linkedin.picture": picture,
            "integrations.linkedin.sub": sub,
            "integrations.linkedin.access_token": access_token,
        }},
    )

    return {"name": name, "email": email}


async def get_profile(user_id: str) -> dict:
    db = get_db()
    user = await db.users.find_one({"_id": __import__("bson").ObjectId(user_id)})
    li = user.get("integrations", {}).get("linkedin", {})
    if not li.get("connected"):
        raise ValueError("LinkedIn not connected")
    return {
        "name": li.get("name", ""),
        "email": li.get("email", ""),
        "picture": li.get("picture", ""),
    }


async def disconnect(user_id: str):
    db = get_db()
    await db.users.update_one(
        {"_id": __import__("bson").ObjectId(user_id)},
        {"$set": {
            "integrations.linkedin.connected": False,
            "integrations.linkedin.access_token": "",
            "integrations.linkedin.name": "",
        }},
    )
