"""Справочники: категории, поля и статусы — проверка значений и сборка ответов."""
import json
import re
import uuid
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Asset, AssetCategory, AssetStatusOption, CategoryField
from app.schemas.catalog import CategoryFieldOut, CategoryOut, StatusOut


def new_key(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


# --- Чтение ----------------------------------------------------------------

def _counts(db: Session, column) -> Dict[str, int]:
    return {key: count for key, count in db.query(column, func.count(Asset.id)).group_by(column).all()}


def field_out(field: CategoryField) -> CategoryFieldOut:
    try:
        options = json.loads(field.options) if field.options else []
    except ValueError:
        options = []
    return CategoryFieldOut(
        id=field.id,
        key=field.key,
        label=field.label,
        field_type=field.field_type,
        options=options if isinstance(options, list) else [],
        placeholder=field.placeholder,
        required=field.required,
        show_in_card=field.show_in_card,
        position=field.position,
    )


def category_out(category: AssetCategory, asset_count: int = 0) -> CategoryOut:
    return CategoryOut(
        id=category.id,
        key=category.key,
        name=category.name,
        description=category.description,
        color=category.color,
        icon=category.icon,
        position=category.position,
        is_active=category.is_active,
        auto_include_in_handover=category.auto_include_in_handover,
        fields=[field_out(f) for f in category.fields],
        asset_count=asset_count,
    )


def list_categories(db: Session) -> List[CategoryOut]:
    counts = _counts(db, Asset.asset_type)
    categories = db.query(AssetCategory).order_by(AssetCategory.position, AssetCategory.id).all()
    return [category_out(c, counts.get(c.key, 0)) for c in categories]


def list_statuses(db: Session) -> List[StatusOut]:
    counts = _counts(db, Asset.status)
    statuses = db.query(AssetStatusOption).order_by(AssetStatusOption.position, AssetStatusOption.id).all()
    return [
        StatusOut(
            id=s.id, key=s.key, name=s.name, color=s.color, is_closed=s.is_closed,
            is_default=s.is_default, position=s.position, asset_count=counts.get(s.key, 0),
        )
        for s in statuses
    ]


# --- Проверка значений актива -----------------------------------------------

def get_category(db: Session, key: str, *, allow_inactive: bool = False) -> AssetCategory:
    category = db.query(AssetCategory).filter(AssetCategory.key == key).first()
    if not category or (not category.is_active and not allow_inactive):
        raise _bad_request("Категория не найдена или отключена")
    return category


def resolve_status(db: Session, key: Optional[str]) -> str:
    if key:
        if not db.query(AssetStatusOption).filter(AssetStatusOption.key == key).first():
            raise _bad_request("Такого статуса нет")
        return key
    default = (
        db.query(AssetStatusOption)
        .order_by(AssetStatusOption.is_default.desc(), AssetStatusOption.position)
        .first()
    )
    if not default:
        raise _bad_request("Не настроено ни одного статуса")
    return default.key


def status_names(db: Session) -> Dict[str, str]:
    return {key: name for key, name in db.query(AssetStatusOption.key, AssetStatusOption.name).all()}


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _coerce(field: CategoryField, value: Any) -> Any:
    """Приводит значение к типу поля. Возвращает None для пустых значений."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    kind = field.field_type
    if kind == "checkbox":
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("1", "true", "yes", "on", "да")
    if kind == "number":
        try:
            number = float(str(value).replace(",", "."))
        except ValueError:
            raise _bad_request(f"Поле «{field.label}»: нужно число")
        return int(number) if number.is_integer() else number
    text = str(value).strip()
    if kind == "date":
        if not _DATE_RE.match(text):
            raise _bad_request(f"Поле «{field.label}»: нужна дата")
        try:
            date.fromisoformat(text)
        except ValueError:
            raise _bad_request(f"Поле «{field.label}»: некорректная дата")
    if kind == "select":
        options = field_out(field).options
        if options and text not in options:
            raise _bad_request(f"Поле «{field.label}»: значение не из списка")
    return text


def clean_custom_fields(category: AssetCategory, values: Dict[str, Any]) -> str:
    """Оставляет только поля категории, проверяет обязательные и типы. Возвращает JSON для БД."""
    cleaned: Dict[str, Any] = {}
    for field in category.fields:
        value = _coerce(field, values.get(field.key))
        # Для обязательного флажка «заполнено» значит «отмечено»
        missing = value is None or (field.field_type == "checkbox" and value is False)
        if missing and field.required:
            raise _bad_request(f"Заполните поле «{field.label}»")
        if value is not None:
            cleaned[field.key] = value
    return json.dumps(cleaned, ensure_ascii=False)


def load_custom_fields(asset: Asset) -> Dict[str, Any]:
    try:
        data = json.loads(asset.custom_fields) if asset.custom_fields else {}
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}
