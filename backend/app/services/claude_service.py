import json

import anthropic

from app.core.config import settings


async def generate_action_with_ai(description: str, contact_id: str | None = None) -> dict:
    """Use Claude to generate an Action from a natural language description."""
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not configured")

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

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
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    return json.loads(message.content[0].text)
