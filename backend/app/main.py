from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import close_db, connect_db
from app.routers import actions, auth, canvas, contacts, gmail, integrations, linkedin, messages, notifications, pages, telegram, uploads, webhooks
from app.services.websocket_manager import ws_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await ws_manager.start_redis_listener()
    yield
    await ws_manager.stop_redis_listener()
    await close_db()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(contacts.router, prefix=settings.API_V1_PREFIX)
app.include_router(canvas.router, prefix=settings.API_V1_PREFIX)
app.include_router(pages.router, prefix=settings.API_V1_PREFIX)
app.include_router(actions.router, prefix=settings.API_V1_PREFIX)
app.include_router(messages.router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications.router, prefix=settings.API_V1_PREFIX)
app.include_router(integrations.router, prefix=settings.API_V1_PREFIX)
app.include_router(telegram.router, prefix=settings.API_V1_PREFIX)
app.include_router(gmail.router, prefix=settings.API_V1_PREFIX)
app.include_router(linkedin.router, prefix=settings.API_V1_PREFIX)
app.include_router(uploads.router, prefix=settings.API_V1_PREFIX)
app.include_router(webhooks.router)  # public, no /api/v1 prefix (external callers)


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.VERSION}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint — auth via JWT cookie or ?token= query param."""
    from jose import jwt, JWTError
    from app.core.security import COOKIE_NAME

    token = websocket.cookies.get(COOKIE_NAME) or websocket.query_params.get("token", "")
    if not token:
        await websocket.close(code=1008)
        return

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=1008)
            return
    except JWTError:
        await websocket.close(code=1008)
        return

    await ws_manager.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, websocket)
