import asyncio
import json
import logging

import redis.asyncio as aioredis
from fastapi import WebSocket

from app.core.config import settings

log = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
        self._redis_task: asyncio.Task | None = None

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_to_user(self, user_id: str, event_type: str, payload: dict):
        if user_id not in self.active_connections:
            return
        message = json.dumps({"type": event_type, "payload": payload})
        dead: list[WebSocket] = []
        for ws in self.active_connections[user_id]:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def send_raw(self, user_id: str, raw_message: str):
        """Send pre-serialized JSON message."""
        if user_id not in self.active_connections:
            return
        dead: list[WebSocket] = []
        for ws in self.active_connections[user_id]:
            try:
                await ws.send_text(raw_message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def start_redis_listener(self):
        """Listen on Redis channels ws:user:* and forward to connected websockets."""
        if self._redis_task is not None:
            return

        async def _listen():
            redis_client = aioredis.from_url(settings.REDIS_URL)
            pubsub = redis_client.pubsub()
            await pubsub.psubscribe("ws:user:*")
            log.info("Redis pub/sub listener started for WebSocket")

            try:
                async for msg in pubsub.listen():
                    if msg["type"] != "pmessage":
                        continue
                    channel = msg["channel"].decode() if isinstance(msg["channel"], bytes) else msg["channel"]
                    # channel format: ws:user:{user_id}
                    parts = channel.split(":")
                    if len(parts) != 3:
                        continue
                    user_id = parts[2]
                    data = msg["data"]
                    raw = data.decode() if isinstance(data, bytes) else data
                    await self.send_raw(user_id, raw)
            except asyncio.CancelledError:
                pass
            finally:
                try:
                    await pubsub.aclose()
                    await redis_client.aclose()
                except Exception:
                    pass

        self._redis_task = asyncio.create_task(_listen())

    async def stop_redis_listener(self):
        if self._redis_task is not None:
            self._redis_task.cancel()
            try:
                await self._redis_task
            except asyncio.CancelledError:
                pass
            self._redis_task = None


ws_manager = WebSocketManager()
