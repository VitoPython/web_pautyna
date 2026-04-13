"""Unipile API integration service.

This is a placeholder that will be fully implemented when Unipile credentials are configured.
"""

import httpx

from app.core.config import settings

UNIPILE_BASE_URL = "https://api.unipile.com/api/v1"


class UnipileService:
    def __init__(self):
        self.api_key = settings.UNIPILE_API_KEY
        self.dsn = settings.UNIPILE_DSN
        self.headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json",
        }

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.dsn)

    async def get_accounts(self) -> list[dict]:
        if not self.is_configured:
            return []
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{UNIPILE_BASE_URL}/accounts", headers=self.headers)
            resp.raise_for_status()
            return resp.json().get("items", [])

    async def get_relations(self, account_id: str) -> list[dict]:
        if not self.is_configured:
            return []
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{UNIPILE_BASE_URL}/accounts/{account_id}/relations",
                headers=self.headers,
            )
            resp.raise_for_status()
            return resp.json().get("items", [])

    async def send_message(self, account_id: str, recipient_id: str, content: str) -> dict:
        if not self.is_configured:
            raise ValueError("Unipile is not configured")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{UNIPILE_BASE_URL}/accounts/{account_id}/messages",
                headers=self.headers,
                json={"recipient_id": recipient_id, "text": content},
            )
            resp.raise_for_status()
            return resp.json()

    async def get_messages(self, account_id: str, limit: int = 50) -> list[dict]:
        if not self.is_configured:
            return []
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{UNIPILE_BASE_URL}/accounts/{account_id}/messages",
                headers=self.headers,
                params={"limit": limit},
            )
            resp.raise_for_status()
            return resp.json().get("items", [])


unipile_service = UnipileService()
