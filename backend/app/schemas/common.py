from datetime import datetime, timezone
from typing import Annotated, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer


def _to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _empty_to_none(value):
    if isinstance(value, str) and not value.strip():
        return None
    return value


# В БД даты лежат как naive UTC; отдаём их с явным "Z", чтобы клиент не гадал о часовом поясе
UTCDateTime = Annotated[datetime, PlainSerializer(_to_utc_iso, return_type=str)]

# Необязательная строка: пустое значение из формы сохраняем как NULL
OptionalStr = Annotated[Optional[str], BeforeValidator(_empty_to_none)]


def LimitedStr(max_length: int):  # noqa: N802 — используется как тип
    """Необязательная строка с ограничением длины (пустая → NULL)."""
    return Annotated[Optional[Annotated[str, Field(max_length=max_length)]], BeforeValidator(_empty_to_none)]


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    message: str
