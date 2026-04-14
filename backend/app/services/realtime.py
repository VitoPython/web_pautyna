"""Shared helpers for publishing real-time events to the frontend.

Events travel via Redis pub/sub (channel `ws:user:{user_id}`) so that
any backend process — API workers, Celery tasks, standalone listeners —
can broadcast to a user's WebSocket without a direct reference to the
websocket_manager singleton. The FastAPI process subscribes to the
pattern and forwards messages to its connected sockets.
"""

import json
import logging

import redis.asyncio as aioredis

from app.core.config import settings

log = logging.getLogger(__name__)


async def publish_event(user_id: str, event_type: str, payload: dict) -> None:
    """Publish a typed event to a single user's WebSocket channel."""
    try:
        client = aioredis.from_url(settings.REDIS_URL)
        try:
            await client.publish(
                f"ws:user:{user_id}",
                json.dumps({"type": event_type, "payload": payload}),
            )
        finally:
            await client.aclose()
    except Exception as e:
        log.warning(f"Failed to publish {event_type} for {user_id}: {e}")
