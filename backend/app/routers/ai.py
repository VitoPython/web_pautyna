"""AI endpoints powered by Claude.

Three capabilities:
- POST /ai/chat                  — streaming chat with the assistant
- POST /ai/suggest-reply         — 2-3 reply suggestions for an Inbox thread
- POST /ai/summary/{contact_id}  — generate + persist a contact overview

Chat uses SSE so the UI can render tokens as they arrive. The other two return
plain JSON — they're short and fire-and-forget.
"""

import logging

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.services import claude_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post("/chat")
async def chat(req: ChatRequest, user_id: str = Depends(get_current_user_id)):
    """Streaming chat with Claude. Returns SSE (text/event-stream)."""
    if not req.messages or req.messages[0].role != "user":
        raise HTTPException(status_code=400, detail="Перше повідомлення має бути від користувача")

    messages_payload = [{"role": m.role, "content": m.content} for m in req.messages]

    async def sse_gen():
        try:
            async for chunk in claude_service.chat_stream(messages_payload):
                # SSE data frames — we JSON-encode the chunk so newlines stay intact.
                import json as _json
                yield f"data: {_json.dumps({'text': chunk})}\n\n"
        except Exception as e:
            log.exception("Claude chat failed")
            import json as _json
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        sse_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class SuggestReplyRequest(BaseModel):
    contact_id: str


@router.post("/suggest-reply")
async def suggest_reply(
    req: SuggestReplyRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Return 2-3 reply variants for the latest exchange with this contact."""
    db = get_db()
    contact = await db.contacts.find_one({"_id": ObjectId(req.contact_id), "owner_id": user_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    recent = await db.messages.find(
        {"owner_id": user_id, "contact_id": req.contact_id}
    ).sort("sent_at", -1).to_list(10)
    recent.reverse()

    if not recent:
        raise HTTPException(status_code=400, detail="Немає повідомлень для аналізу")

    platform = (recent[-1].get("platform") or "").lower() or "chat"
    try:
        suggestions = await claude_service.suggest_replies(
            contact_name=contact.get("name", ""),
            platform=platform,
            recent_messages=[
                {"direction": m.get("direction", ""), "content": m.get("content", "")}
                for m in recent
            ],
        )
    except Exception as e:
        log.exception("Claude suggest-reply failed")
        raise HTTPException(status_code=502, detail=f"Claude: {e}")

    return {"suggestions": suggestions}


@router.post("/summary/{contact_id}")
async def generate_summary(
    contact_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Generate and persist a contact overview. Idempotent — overwrites prior summary."""
    from datetime import datetime

    db = get_db()
    contact = await db.contacts.find_one({"_id": ObjectId(contact_id), "owner_id": user_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    recent_messages = await db.messages.find(
        {"owner_id": user_id, "contact_id": contact_id}
    ).sort("sent_at", -1).to_list(20)
    recent_messages.reverse()

    notes = await db.pages.find({"owner_id": user_id, "contact_id": contact_id}).to_list(5)

    try:
        summary = await claude_service.summarize_contact(
            contact_name=contact.get("name", ""),
            contact_extra={
                "email": contact.get("email", ""),
                "phone": contact.get("phone", ""),
                "job_title": contact.get("job_title", ""),
                "company": contact.get("company", ""),
                "website": contact.get("website", ""),
            },
            recent_messages=[
                {"direction": m.get("direction", ""), "content": m.get("content", "")}
                for m in recent_messages
            ],
            notes=[{"title": n.get("title", ""), "content": n.get("content", "")} for n in notes],
        )
    except Exception as e:
        log.exception("Claude summary failed")
        raise HTTPException(status_code=502, detail=f"Claude: {e}")

    await db.contacts.update_one(
        {"_id": contact["_id"]},
        {"$set": {"ai_summary": summary, "ai_summary_updated_at": datetime.utcnow()}},
    )

    return {"summary": summary}
