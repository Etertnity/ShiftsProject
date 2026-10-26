"""Работа со временем: в БД храним UTC, журналы передач пишем в часовом поясе смен."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings


def utcnow() -> datetime:
    """Naive UTC — так исторически хранятся даты в БД."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def local_now() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone))
