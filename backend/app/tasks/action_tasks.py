"""Celery tasks for executing Actions."""

from app.tasks.celery_app import celery_app


@celery_app.task(bind=True, max_retries=3)
def execute_action(self, action_id: str):
    """Execute a scheduled action. Placeholder for full implementation."""
    # This will be fully implemented in Phase 3
    # For now, just log the execution
    print(f"Executing action: {action_id}")
    return {"action_id": action_id, "status": "executed"}


@celery_app.task
def sync_contacts(user_id: str, platform: str):
    """Sync contacts from Unipile. Placeholder for full implementation."""
    print(f"Syncing {platform} contacts for user: {user_id}")
    return {"user_id": user_id, "platform": platform, "status": "synced"}
