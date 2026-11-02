"""Активы: кейсы, change management, обращения клиентов — и их история."""
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Literal, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_current_admin_user
from app.core.config import settings
from app.core.time import utcnow
from app.db.session import get_db
from app.models import Asset, AssetEntry, HandoverAsset, User
from app.schemas.asset import AssetClearResult, AssetCreate, AssetEntryCreate, AssetEntryOut, AssetResponse, AssetUpdate
from app.schemas.common import Message
from app.services import catalog
from app.services.asset_history import add_entry
from app.services.case_numbers import by_case_number

router = APIRouter(prefix="/api/assets", tags=["assets"])


class AssetWithLastEntry(AssetResponse):
    last_entry: Optional[AssetEntryOut] = None


def _get_asset_or_404(db: Session, asset_id: int) -> Asset:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Актив не найден")
    return asset


def last_entries(db: Session, asset_ids: List[int]) -> Dict[int, AssetEntry]:
    """Последняя запись истории по каждому активу — одним запросом."""
    if not asset_ids:
        return {}
    latest = (
        db.query(func.max(AssetEntry.id))
        .filter(AssetEntry.asset_id.in_(asset_ids))
        .group_by(AssetEntry.asset_id)
        .scalar_subquery()
    )
    entries = db.query(AssetEntry).filter(AssetEntry.id.in_(latest)).all()
    return {e.asset_id: e for e in entries}


SORTS = {
    "updated_desc": (Asset.updated_at.desc(), Asset.id.desc()),
    "updated_asc": (Asset.updated_at.asc(), Asset.id.asc()),
    "created_desc": (Asset.created_at.desc(), Asset.id.desc()),
    "created_asc": (Asset.created_at.asc(), Asset.id.asc()),
    # Название и номер кейса сортируем в Python: lower() в SQLite не понимает кириллицу, номер — часть названия
    "title": (Asset.id.asc(),),
    "number_asc": (Asset.id.asc(),),
    "number_desc": (Asset.id.asc(),),
}


def _local_day_start_utc(day: date) -> datetime:
    """Начало дня по времени смен (МСК) в naive UTC — так даты хранятся в БД."""
    local = datetime.combine(day, time.min, tzinfo=ZoneInfo(settings.timezone))
    return local.astimezone(timezone.utc).replace(tzinfo=None)


@router.get("/", response_model=List[AssetWithLastEntry])
def list_assets(
    asset_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = Query(default=None, max_length=200),
    # Обновлялся в этот период (даты по МСК, включительно)
    updated_from: Optional[date] = None,
    updated_to: Optional[date] = None,
    # Кейсы, в истории которых есть записи этого сотрудника («мои кейсы»)
    author_id: Optional[int] = None,
    sort: Literal["updated_desc", "updated_asc", "created_desc", "created_asc", "title", "number_asc", "number_desc"] = "updated_desc",
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    query = db.query(Asset)
    if asset_type:
        query = query.filter(Asset.asset_type == asset_type)
    if status:
        query = query.filter(Asset.status == status)
    if updated_from:
        query = query.filter(Asset.updated_at >= _local_day_start_utc(updated_from))
    if updated_to:
        query = query.filter(Asset.updated_at < _local_day_start_utc(updated_to + timedelta(days=1)))
    if author_id is not None:
        authored = db.query(AssetEntry.asset_id).filter(AssetEntry.author_id == author_id)
        query = query.filter(Asset.id.in_(authored.scalar_subquery()))
    assets = query.order_by(*SORTS[sort]).all()
    if sort == "title":
        assets.sort(key=lambda a: a.title.casefold())
    elif sort in ("number_asc", "number_desc"):
        assets = by_case_number(assets, lambda a: a.title, descending=sort == "number_desc")
    if search and search.strip():
        # SQLite ILIKE не учитывает регистр только для латиницы, поэтому кириллицу сравниваем в Python.
        # Ищем и в истории: «что сделано» по кейсу тоже находится
        needle = search.strip().casefold()
        history: Dict[int, List[str]] = {}
        for asset_id, text in db.query(AssetEntry.asset_id, AssetEntry.text).filter(
            AssetEntry.asset_id.in_([a.id for a in assets]), AssetEntry.text.isnot(None)
        ):
            history.setdefault(asset_id, []).append(text.casefold())
        assets = [
            a for a in assets
            if needle in a.title.casefold()
            or needle in a.description.casefold()
            or needle in (a.custom_fields or "").casefold()
            or any(needle in text for text in history.get(a.id, []))
        ]
    latest = last_entries(db, [a.id for a in assets])
    return [
        AssetWithLastEntry(
            **AssetResponse.model_validate(a).model_dump(),
            last_entry=AssetEntryOut.model_validate(latest[a.id]) if a.id in latest else None,
        )
        for a in assets
    ]


@router.post("/", response_model=AssetResponse)
def create_asset(asset_in: AssetCreate, db: Session = Depends(get_db), user: User = Depends(get_current_active_user)):
    category = catalog.get_category(db, asset_in.asset_type)
    asset = Asset(
        title=asset_in.title,
        description=asset_in.description,
        asset_type=category.key,
        status=catalog.resolve_status(db, asset_in.status),
        custom_fields=catalog.clean_custom_fields(category, asset_in.custom_fields),
    )
    db.add(asset)
    db.flush()
    add_entry(db, asset, user, "created", new_status=asset.status)
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/clear", response_model=AssetClearResult)
def clear_assets(db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    """Удалить все кейсы вместе с историей — например, перед загрузкой журнала заново. Только администратор.
    Объявлен раньше /{asset_id}, иначе «clear» разбирался бы как id."""
    assets = db.query(Asset).count()
    entries = db.query(AssetEntry).count()
    db.query(HandoverAsset).delete()
    db.query(AssetEntry).delete()
    db.query(Asset).delete()
    db.commit()
    return AssetClearResult(message=f"Удалено кейсов: {assets}", deleted_assets=assets, deleted_entries=entries)


@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_active_user)):
    return _get_asset_or_404(db, asset_id)


@router.put("/{asset_id}", response_model=AssetResponse)
def update_asset(
    asset_id: int,
    asset_in: AssetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    asset = _get_asset_or_404(db, asset_id)
    changed: List[str] = []

    new_type = asset_in.asset_type or asset.asset_type
    # Отключённую категорию можно оставить у старого актива, но нельзя выбрать заново
    category = catalog.get_category(db, new_type, allow_inactive=new_type == asset.asset_type)
    if new_type != asset.asset_type:
        asset.asset_type = new_type
        changed.append("категория")

    if asset_in.title is not None and asset_in.title != asset.title:
        asset.title = asset_in.title
        changed.append("название")
    if asset_in.description is not None and asset_in.description != asset.description:
        asset.description = asset_in.description
        changed.append("описание")

    current_fields = catalog.load_custom_fields(asset)
    if asset_in.custom_fields is not None or "категория" in changed:
        merged = {**current_fields, **(asset_in.custom_fields or {})}
        cleaned = catalog.clean_custom_fields(category, merged)
        if cleaned != (asset.custom_fields or "{}"):
            asset.custom_fields = cleaned
            if asset_in.custom_fields is not None:
                changed.append("поля")

    old_status = asset.status
    if asset_in.status is not None and asset_in.status != asset.status:
        asset.status = catalog.resolve_status(db, asset_in.status)

    if old_status != asset.status:
        add_entry(db, asset, user, "status", text=asset_in.comment, old_status=old_status,
                  new_status=asset.status, shift_id=asset_in.shift_id)
    elif asset_in.comment:
        add_entry(db, asset, user, "comment", text=asset_in.comment, shift_id=asset_in.shift_id)
    if changed:
        add_entry(db, asset, user, "edit", text="Изменено: " + ", ".join(changed), shift_id=asset_in.shift_id)

    asset.updated_at = utcnow()
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/{asset_id}", response_model=Message)
def delete_asset(asset_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    # Удаление стирает историю кейса — только администратор
    asset = _get_asset_or_404(db, asset_id)
    # Убираем ссылки из передач и историю, чтобы не осталось висячих записей
    db.query(HandoverAsset).filter(HandoverAsset.asset_id == asset_id).delete()
    db.query(AssetEntry).filter(AssetEntry.asset_id == asset_id).delete()
    db.delete(asset)
    db.commit()
    return Message(message="Актив удалён")


@router.get("/{asset_id}/entries", response_model=List[AssetEntryOut])
def list_entries(asset_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_active_user)):
    _get_asset_or_404(db, asset_id)
    return (
        db.query(AssetEntry)
        .filter(AssetEntry.asset_id == asset_id)
        .order_by(AssetEntry.created_at.desc(), AssetEntry.id.desc())
        .all()
    )


@router.post("/{asset_id}/entries", response_model=AssetEntryOut)
def create_entry(
    asset_id: int,
    entry_in: AssetEntryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    """Быстрая запись по ходу смены: комментарий и/или новый статус."""
    asset = _get_asset_or_404(db, asset_id)
    old_status = asset.status
    if entry_in.status and entry_in.status != asset.status:
        asset.status = catalog.resolve_status(db, entry_in.status)
        entry = add_entry(db, asset, user, "status", text=entry_in.text, old_status=old_status,
                          new_status=asset.status, shift_id=entry_in.shift_id)
    elif entry_in.text:
        entry = add_entry(db, asset, user, "comment", text=entry_in.text, shift_id=entry_in.shift_id)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Статус не изменился — добавьте комментарий")
    asset.updated_at = utcnow()
    db.commit()
    db.refresh(entry)
    return entry
