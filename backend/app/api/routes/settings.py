"""Настройки, которые администратор меняет сам: категории активов, их поля и статусы."""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_current_admin_user
from app.db.session import get_db
from app.models import Asset, AssetCategory, AssetStatusOption, CategoryField, User
from app.schemas.catalog import CatalogOut, CategoryIn, CategoryOut, OrderIn, StatusesIn, StatusOut
from app.schemas.common import Message
from app.services import catalog

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _get_category_or_404(db: Session, category_id: int) -> AssetCategory:
    category = db.get(AssetCategory, category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Категория не найдена")
    return category


def _apply_category(db: Session, category: AssetCategory, data: CategoryIn) -> None:
    category.name = data.name
    category.description = data.description
    category.color = data.color
    category.icon = data.icon
    category.is_active = data.is_active
    category.auto_include_in_handover = data.auto_include_in_handover

    existing = {f.id: f for f in category.fields}
    kept_fields = []
    for position, field_in in enumerate(data.fields):
        if field_in.field_type == "select" and not field_in.options:
            raise _bad_request(f"Поле «{field_in.label}»: добавьте варианты выбора")
        if field_in.id is not None:
            field = existing.get(field_in.id)
            if field is None:
                raise _bad_request("Поле не принадлежит этой категории")
        else:
            field = CategoryField(key=catalog.new_key("f"))
        field.label = field_in.label
        field.field_type = field_in.field_type
        field.options = json.dumps(field_in.options, ensure_ascii=False) if field_in.field_type == "select" else None
        field.placeholder = field_in.placeholder
        field.required = field_in.required
        field.show_in_card = field_in.show_in_card
        field.position = position
        kept_fields.append(field)
    # Удалённые из списка поля удаляются (delete-orphan); их значения в активах просто перестают показываться
    category.fields = kept_fields


def _category_response(db: Session, category: AssetCategory) -> CategoryOut:
    count = db.query(Asset).filter(Asset.asset_type == category.key).count()
    return catalog.category_out(category, count)


@router.get("/catalog", response_model=CatalogOut)
def get_catalog(db: Session = Depends(get_db), _: User = Depends(get_current_active_user)):
    """Справочники нужны всем сотрудникам — для форм и фильтров."""
    return CatalogOut(categories=catalog.list_categories(db), statuses=catalog.list_statuses(db))


@router.post("/categories", response_model=CategoryOut)
def create_category(data: CategoryIn, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    position = db.query(AssetCategory).count()
    category = AssetCategory(key=catalog.new_key("cat"), position=position)
    db.add(category)
    _apply_category(db, category, data)
    db.commit()
    db.refresh(category)
    return _category_response(db, category)


# /order объявлен раньше /{category_id}, чтобы не перехватывался как id
@router.put("/categories/order", response_model=Message)
def reorder_categories(order: OrderIn, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    categories = {c.id: c for c in db.query(AssetCategory).all()}
    if set(order.ids) != set(categories):
        raise _bad_request("Список категорий устарел — обновите страницу")
    for position, category_id in enumerate(order.ids):
        categories[category_id].position = position
    db.commit()
    return Message(message="Порядок сохранён")


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    data: CategoryIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    category = _get_category_or_404(db, category_id)
    _apply_category(db, category, data)
    db.commit()
    db.refresh(category)
    return _category_response(db, category)


@router.delete("/categories/{category_id}", response_model=Message)
def delete_category(category_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    category = _get_category_or_404(db, category_id)
    used = db.query(Asset).filter(Asset.asset_type == category.key).count()
    if used:
        raise _bad_request(f"В категории {used} актив(ов). Отключите её вместо удаления — история сохранится.")
    db.delete(category)
    db.commit()
    return Message(message="Категория удалена")


@router.put("/statuses", response_model=list[StatusOut])
def replace_statuses(data: StatusesIn, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    """Сохраняет весь список статусов разом: порядок, переименования, добавления и удаления."""
    if all(s.is_closed for s in data.statuses):
        raise _bad_request("Нужен хотя бы один открытый статус")
    defaults = [s for s in data.statuses if s.is_default]
    if len(defaults) > 1:
        raise _bad_request("Статус по умолчанию может быть только один")
    default_in = defaults[0] if defaults else next(s for s in data.statuses if not s.is_closed)
    if default_in.is_closed:
        raise _bad_request("Статус по умолчанию должен быть открытым")

    existing = {s.id: s for s in db.query(AssetStatusOption).all()}
    keep_ids = {s.id for s in data.statuses if s.id is not None}
    unknown = keep_ids - set(existing)
    if unknown:
        raise _bad_request("Список статусов устарел — обновите страницу")

    for removed in (s for sid, s in existing.items() if sid not in keep_ids):
        used = db.query(Asset).filter(Asset.status == removed.key).count()
        if used:
            raise _bad_request(f"Статус «{removed.name}» используется в {used} актив(ах) — сначала смените им статус")
        db.delete(removed)

    for position, status_in in enumerate(data.statuses):
        option = existing[status_in.id] if status_in.id is not None else AssetStatusOption(key=catalog.new_key("st"))
        option.name = status_in.name
        option.color = status_in.color
        option.is_closed = status_in.is_closed
        option.is_default = status_in is default_in
        option.position = position
        db.add(option)

    db.commit()
    return catalog.list_statuses(db)
