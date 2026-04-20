from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "pavutyna",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.action_tasks", "app.tasks.campaign_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

celery_app.conf.beat_schedule = {
    "actions-scheduler-every-minute": {
        "task": "app.tasks.action_tasks.actions_scheduler",
        "schedule": 60.0,
    },
    "follow-up-checker-hourly": {
        "task": "app.tasks.action_tasks.follow_up_checker",
        "schedule": crontab(minute=5),  # at :05 every hour
    },
    "sync-contacts-every-15min": {
        "task": "app.tasks.action_tasks.sync_contacts_all",
        "schedule": 15 * 60.0,
    },
    "campaigns-scheduler-every-minute": {
        "task": "app.tasks.campaign_tasks.campaigns_scheduler",
        "schedule": 60.0,
    },
}

celery_app.autodiscover_tasks(["app.tasks"])
