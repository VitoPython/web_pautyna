"""Claude-powered AI features for Pavutyna.

Three user-facing capabilities:
- generate_action_with_ai: turn a natural-language description into an Action JSON
- chat_stream: general assistant chat (SSE streaming)
- suggest_replies: propose 2-3 reply variants based on chat history + contact
- summarize_contact: one-paragraph overview of a contact across notes + DMs

All use the Claude Messages API via the official SDK. The big, stable system
prompts get `cache_control: ephemeral` so repeated calls in the same session
reuse the prefix.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import anthropic

from app.core.config import settings

MODEL = "claude-sonnet-4-6"


def _client() -> anthropic.AsyncAnthropic:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not configured")
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


# ─── Action generator (existing, kept) ───────────────────────────────

async def generate_action_with_ai(description: str, contact_id: str | None = None) -> dict:
    """Turn a natural-language automation request into an Action JSON."""
    client = _client()

    prompt = f"""You are an automation assistant for a CRM platform called Pavutyna.
The user wants to create an automation action.

User description: "{description}"
Contact ID: {contact_id or "not specified"}

Generate a JSON object with these fields:
- name: short action name (Ukrainian or English)
- description: what this action does
- contact_id: "{contact_id}" or null
- trigger: object with type ("schedule"|"event"|"condition"), cron (if schedule), event (if event)
- steps: array of steps, each with order, type ("send_message"|"create_note"|"add_reminder"|"fetch_posts"), platform ("linkedin"|"instagram"|null), content, delay_minutes

Return ONLY valid JSON, no markdown or explanation."""

    message = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    for block in message.content:
        if block.type == "text":
            return json.loads(block.text)
    raise ValueError("Claude did not return text content")


# ─── Assistant chat ──────────────────────────────────────────────────

CHAT_SYSTEM = """Ти — AI-асистент у платформі Pavutyna: персональний CRM, де \
кожен контакт — нода у 3D graph-у павутини, з нотатками і історією повідомлень \
з Telegram/Gmail/LinkedIn через Unipile.

Твоя роль: допомагати користувачу:
- обдумувати комунікацію з контактами (як відповісти, що запропонувати)
- будувати автоматизації (нагадування, follow-up'и, шаблони)
- підсумовувати контакти та їхні взаємодії
- давати загальні поради щодо networking і product development

Правила спілкування:
- Відповідай українською, якщо запит українською
- Будь стислим, без води. Порадив — поясни чому одним реченням
- Пропонуй конкретні наступні кроки, не абстракції
- Не вигадуй фактів про контакти — якщо не знаєш, запитай
"""


async def chat_stream(messages: list[dict[str, Any]]) -> AsyncIterator[str]:
    """Stream a chat response token-by-token.

    `messages` is a list of {"role": "user"|"assistant", "content": str}.
    Yields plain text chunks as SSE data for the frontend to consume.
    """
    client = _client()

    async with client.messages.stream(
        model=MODEL,
        max_tokens=8192,
        system=[
            {
                "type": "text",
                "text": CHAT_SYSTEM,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text


# ─── Reply suggestions for Inbox composer ────────────────────────────

SUGGEST_SYSTEM = """Ти пишеш відповіді від імені користувача Pavutyna. \
Користувач отримав повідомлення і йому потрібні 2-3 варіанти відповіді, між \
якими він обере. Варіанти мають відрізнятись за тоном і довжиною.

Повертай ЛИШЕ JSON-масив з 2-3 рядками, без markdown, без коментарів. Кожен \
рядок — готовий текст відповіді, який можна одразу надіслати. Без \
префіксів типу "Варіант 1:".

Приклад формату відповіді:
["Привіт! Давай обговоримо деталі у понеділок", "Дякую, розгляну і повернусь до тебе", "Ок"]"""


async def suggest_replies(
    contact_name: str,
    platform: str,
    recent_messages: list[dict[str, Any]],
) -> list[str]:
    """Given the last few messages in a chat, return 2-3 reply suggestions.

    `recent_messages` items: {"direction": "inbound"|"outbound", "content": str}.
    """
    client = _client()

    # Build a compact transcript. Keep the most recent ~10 messages.
    lines = []
    for m in recent_messages[-10:]:
        who = "Контакт" if m.get("direction") == "inbound" else "Ви"
        lines.append(f"{who}: {m.get('content', '')}")
    transcript = "\n".join(lines)

    user_prompt = f"""Платформа: {platform}
Контакт: {contact_name}

Останні повідомлення:
{transcript}

Запропонуй 2-3 варіанти відповіді. JSON-масив рядків."""

    message = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": SUGGEST_SYSTEM,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_prompt}],
    )

    for block in message.content:
        if block.type == "text":
            text = block.text.strip()
            # Defensive: strip accidental markdown fencing if Claude adds it.
            if text.startswith("```"):
                text = text.strip("`").lstrip("json").strip()
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(s) for s in parsed if str(s).strip()][:3]
    return []


# ─── Contact summary ─────────────────────────────────────────────────

SUMMARY_SYSTEM = """Ти пишеш стислий professional overview контакту на основі \
нотаток користувача і історії повідомлень. Мета — щоб користувач за 3 секунди \
згадав хто це, чим займається і про що говорили.

Правила:
- 3-5 речень, українською
- Спершу: хто ця людина (якщо зрозуміло з контексту)
- Далі: головні теми останніх розмов
- Наприкінці: якщо є conversational hooks — про що можна запитати при наступній \
зустрічі. Одним реченням.
- Не вигадуй фактів. Якщо інформації обмаль — напиши що є і все.
- Без markdown, без bullet-points, чистий абзац"""


async def summarize_contact(
    contact_name: str,
    contact_extra: dict[str, Any],
    recent_messages: list[dict[str, Any]],
    notes: list[dict[str, Any]],
) -> str:
    """Generate a 3-5 sentence overview of the contact."""
    client = _client()

    # Compact transcript — last 20 messages max, trim long text.
    msg_lines = []
    for m in recent_messages[-20:]:
        who = "вони" if m.get("direction") == "inbound" else "я"
        content = (m.get("content") or "").strip()[:200]
        if content:
            msg_lines.append(f"[{who}] {content}")

    note_lines = []
    for n in notes[:5]:
        title = (n.get("title") or "").strip()
        content = (n.get("content") or "").strip()[:500]
        if content:
            note_lines.append(f"• {title}: {content}")

    # Human-readable profile fields if present.
    profile_parts = []
    for key, label in [("email", "Email"), ("phone", "Phone"), ("job_title", "Посада"), ("company", "Компанія"), ("website", "Сайт")]:
        val = (contact_extra.get(key) or "").strip()
        if val:
            profile_parts.append(f"{label}: {val}")
    profile = "\n".join(profile_parts) or "(базова інформація відсутня)"

    user_prompt = f"""Ім'я: {contact_name}

Профіль:
{profile}

Нотатки користувача:
{chr(10).join(note_lines) or "(нема)"}

Останні повідомлення:
{chr(10).join(msg_lines) or "(нема)"}

Напиши summary."""

    message = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": SUMMARY_SYSTEM,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_prompt}],
    )

    for block in message.content:
        if block.type == "text":
            return block.text.strip()
    return ""
