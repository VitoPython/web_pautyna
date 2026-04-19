"""Unipile client — single integration surface for Telegram, Gmail, LinkedIn,
Instagram, and Calendar.

Unipile hosts the long-running connections to each platform; we interact with
them through one REST API + one webhook endpoint. This service is a thin
async wrapper around that API using httpx.

DSN format: Unipile gives each tenant a dedicated host like
`api38.unipile.com:16889`. We accept both `api38.unipile.com:16889` and
`https://api38.unipile.com:16889` in UNIPILE_DSN.

Auth: `X-API-KEY` header on every request.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)


def _base_url() -> str:
    dsn = (settings.UNIPILE_DSN or "").strip().rstrip("/")
    if not dsn:
        raise RuntimeError("UNIPILE_DSN not configured")
    if not dsn.startswith("http://") and not dsn.startswith("https://"):
        dsn = f"https://{dsn}"
    return dsn


def _headers() -> dict[str, str]:
    key = (settings.UNIPILE_API_KEY or "").strip()
    if not key:
        raise RuntimeError("UNIPILE_API_KEY not configured")
    return {
        "X-API-KEY": key,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


async def _request(method: str, path: str, **kwargs) -> dict:
    """Low-level request. Raises on HTTP errors, returns parsed JSON dict."""
    url = f"{_base_url()}{path}"
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.request(method, url, headers=_headers(), **kwargs)
        if resp.status_code >= 400:
            body = resp.text[:500]
            log.warning(f"Unipile {method} {path} → {resp.status_code}: {body}")
            raise httpx.HTTPStatusError(
                f"Unipile error {resp.status_code}: {body}",
                request=resp.request,
                response=resp,
            )
        if not resp.content:
            return {}
        try:
            return resp.json()
        except Exception:
            return {"raw": resp.text}


# ─── Hosted auth links ───────────────────────────────────────────────

PROVIDER_CODES = {
    "telegram": "TELEGRAM",
    "gmail": "GOOGLE",
    "google": "GOOGLE",
    "linkedin": "LINKEDIN",
    "instagram": "INSTAGRAM",
    "whatsapp": "WHATSAPP",
    "google_calendar": "GOOGLE_CALENDAR",
    "outlook_calendar": "OUTLOOK",
}


async def create_hosted_auth_link(
    user_id: str,
    providers: list[str] | str,
    success_url: str,
    failure_url: str,
    notify_url: str,
    ttl_hours: int = 1,
) -> str:
    """Ask Unipile to generate a hosted auth URL for this user.

    `user_id` is embedded in `name` so the webhook callback can map the new
    account_id back to our user. `providers` can be "*" (all supported), or
    a list of platform codes.
    """
    if isinstance(providers, str):
        provider_payload: Any = providers if providers == "*" else [providers.upper()]
    else:
        provider_payload = [PROVIDER_CODES.get(p.lower(), p.upper()) for p in providers]

    # Unipile requires ISO 8601 with millisecond precision and trailing Z.
    expires_at = (datetime.utcnow() + timedelta(hours=ttl_hours))
    expires_on = expires_at.strftime("%Y-%m-%dT%H:%M:%S.") + f"{expires_at.microsecond // 1000:03d}Z"

    payload = {
        "type": "create",
        "providers": provider_payload,
        "api_url": _base_url(),
        "expiresOn": expires_on,
        "success_redirect_url": success_url,
        "failure_redirect_url": failure_url,
        "notify_url": notify_url,
        "name": user_id,  # echoed back in webhook payload
    }
    data = await _request("POST", "/api/v1/hosted/accounts/link", json=payload)
    url = data.get("url") or data.get("redirect_url") or ""
    if not url:
        raise RuntimeError(f"Unipile did not return a hosted link: {data}")
    return url


# ─── Accounts ────────────────────────────────────────────────────────

async def list_accounts() -> list[dict]:
    data = await _request("GET", "/api/v1/accounts")
    return data.get("items", []) if isinstance(data, dict) else []


async def get_account(account_id: str) -> dict:
    return await _request("GET", f"/api/v1/accounts/{account_id}")


async def delete_account(account_id: str) -> dict:
    return await _request("DELETE", f"/api/v1/accounts/{account_id}")


# ─── Chats / messages ────────────────────────────────────────────────

async def list_chats(account_id: str | None = None, limit: int = 50, cursor: str | None = None) -> dict:
    """List chats (conversations) across one or all accounts."""
    params: dict[str, Any] = {"limit": limit}
    if account_id:
        params["account_id"] = account_id
    if cursor:
        params["cursor"] = cursor
    return await _request("GET", "/api/v1/chats", params=params)


async def get_chat_messages(chat_id: str, limit: int = 100, cursor: str | None = None) -> dict:
    params: dict[str, Any] = {"limit": limit}
    if cursor:
        params["cursor"] = cursor
    return await _request("GET", f"/api/v1/chats/{chat_id}/messages", params=params)


async def send_message(chat_id: str, text: str) -> dict:
    return await _request(
        "POST",
        f"/api/v1/chats/{chat_id}/messages",
        json={"text": text},
    )


# ─── Emails (Gmail / Outlook) ────────────────────────────────────────

async def list_emails(
    account_id: str,
    limit: int = 50,
    cursor: str | None = None,
    from_address: str | None = None,
) -> dict:
    """List emails for an email account. Pass from_address to filter by sender."""
    params: dict[str, Any] = {"account_id": account_id, "limit": limit}
    if cursor:
        params["cursor"] = cursor
    if from_address:
        params["from"] = from_address
    return await _request("GET", "/api/v1/emails", params=params)


async def get_email(email_id: str) -> dict:
    return await _request("GET", f"/api/v1/emails/{email_id}")


async def send_email(
    account_id: str,
    to: list[str],
    subject: str,
    body: str,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
) -> dict:
    """Send a new email (not a reply) from the given account."""
    payload: dict[str, Any] = {
        "account_id": account_id,
        "to": [{"identifier": addr, "identifier_type": "EMAIL_ADDRESS"} for addr in to],
        "subject": subject,
        "body": body,
    }
    if cc:
        payload["cc"] = [{"identifier": a, "identifier_type": "EMAIL_ADDRESS"} for a in cc]
    if bcc:
        payload["bcc"] = [{"identifier": a, "identifier_type": "EMAIL_ADDRESS"} for a in bcc]
    return await _request("POST", "/api/v1/emails", json=payload)


async def get_attendee(account_id: str, attendee_id: str) -> dict:
    return await _request(
        "GET",
        f"/api/v1/chat_attendees/{attendee_id}",
        params={"account_id": account_id},
    )


# ─── Contacts / users ────────────────────────────────────────────────

async def list_chat_attendees(account_id: str, limit: int = 200, cursor: str | None = None) -> dict:
    """List all attendees (people/users) known to an account — Unipile's
    equivalent of the account's contact list."""
    params: dict[str, Any] = {"account_id": account_id, "limit": limit}
    if cursor:
        params["cursor"] = cursor
    return await _request("GET", "/api/v1/chat_attendees", params=params)


async def get_chat_attendees_for_chat(chat_id: str) -> list[dict]:
    """Attendees of a specific chat (excludes self). For DMs this is a
    single-element list with the other person."""
    data = await _request("GET", f"/api/v1/chats/{chat_id}/attendees")
    return data.get("items", []) if isinstance(data, dict) else []


async def fetch_attendee_picture(account_id: str, attendee_id: str) -> tuple[bytes, str] | None:
    """Download the attendee's profile picture as raw bytes.

    Returns (bytes, content_type) or None if the attendee has no picture
    (404 from Unipile is treated as "no avatar set").
    """
    url = f"{_base_url()}/api/v1/chat_attendees/{attendee_id}/picture"
    params = {"account_id": account_id}
    timeout = httpx.Timeout(15.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(url, headers=_headers(), params=params)
        if resp.status_code == 404:
            return None
        if resp.status_code >= 400:
            log.warning(f"Unipile picture {attendee_id} → {resp.status_code}")
            return None
        ctype = resp.headers.get("content-type", "image/jpeg")
        return resp.content, ctype


# ─── Webhooks ────────────────────────────────────────────────────────

async def list_webhooks() -> list[dict]:
    data = await _request("GET", "/api/v1/webhooks")
    return data.get("items", []) if isinstance(data, dict) else []


async def create_webhook(url: str, source: str = "messaging", name: str = "pavutyna") -> dict:
    """Subscribe a URL to receive events of `source` kind.

    Sources: "messaging" (new/updated msgs), "account_status" (connect/disconnect),
    "users" (new attendees).
    """
    payload = {
        "source": source,
        "request_url": url,
        "name": name,
        "format": "json",
    }
    return await _request("POST", "/api/v1/webhooks", json=payload)


async def delete_webhook(webhook_id: str) -> dict:
    return await _request("DELETE", f"/api/v1/webhooks/{webhook_id}")


async def ensure_webhooks(public_url: str) -> list[dict]:
    """Idempotently register our webhook endpoint for all needed sources.

    Called from backend lifespan. Safe to call multiple times — skips sources
    already registered with the same URL.
    """
    try:
        existing = await list_webhooks()
    except Exception as e:
        log.warning(f"Unipile: failed to list webhooks on startup: {e}")
        return []

    have = {(w.get("source"), w.get("request_url")) for w in existing}
    wanted = ["messaging", "account_status", "users"]
    created = []
    for source in wanted:
        if (source, public_url) in have:
            continue
        try:
            w = await create_webhook(public_url, source=source, name=f"pavutyna-{source}")
            created.append(w)
            log.info(f"Unipile: registered webhook {source} → {public_url}")
        except Exception as e:
            log.warning(f"Unipile: failed to register {source} webhook: {e}")
    return created
