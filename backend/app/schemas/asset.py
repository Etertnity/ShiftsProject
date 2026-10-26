import json
from typing import Any, Dict, Optional

from pydantic import Field, field_validator, model_validator

from app.schemas.common import InputModel, LimitedStr, OrmModel, UTCDateTime


# Ограничения длины защищают от раздувания БД и «тяжёлых» запросов
TITLE_MAX = 300
TEXT_MAX = 20000


class AssetCreate(InputModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX)
    description: str = Field(min_length=1, max_length=TEXT_MAX)
    asset_type: str = Field(min_length=1, max_length=100)  # ключ категории
    status: Optional[str] = Field(default=None, max_length=100)  # ключ статуса; по умолчанию — статус «по умолчанию»
    custom_fields: Dict[str, Any] = Field(default_factory=dict)


class AssetUpdate(InputModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=TITLE_MAX)
    description: Optional[str] = Field(default=None, min_length=1, max_length=TEXT_MAX)
    asset_type: Optional[str] = Field(default=None, max_length=100)
    status: Optional[str] = Field(default=None, max_length=100)
    custom_fields: Optional[Dict[str, Any]] = None
    # Комментарий к изменению попадёт в историю актива
    comment: LimitedStr(TEXT_MAX) = None
    shift_id: Optional[int] = None


class AssetResponse(OrmModel):
    id: int
    title: str
    description: str
    asset_type: str
    status: str
    custom_fields: Dict[str, Any] = Field(default_factory=dict)
    created_at: UTCDateTime
    updated_at: UTCDateTime

    @field_validator("custom_fields", mode="before")
    @classmethod
    def _parse_json(cls, value):
        if value is None or value == "":
            return {}
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except ValueError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return value


class AssetEntryCreate(InputModel):
    text: LimitedStr(TEXT_MAX) = None
    status: Optional[str] = Field(default=None, max_length=100)
    shift_id: Optional[int] = None

    @model_validator(mode="after")
    def _not_empty(self):
        if not self.text and not self.status:
            raise ValueError("Нужен текст записи или новый статус")
        return self


class AssetEntryOut(OrmModel):
    id: int
    asset_id: int
    kind: str
    text: Optional[str] = None
    old_status: Optional[str] = None
    new_status: Optional[str] = None
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    shift_id: Optional[int] = None
    handover_id: Optional[int] = None
    created_at: UTCDateTime
