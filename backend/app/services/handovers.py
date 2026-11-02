"""Бизнес-логика передач смен: связи с активами, обновления активов, сборка ответа и журнал для экспорта."""
import logging
from collections import defaultdict
from typing import Dict, Iterable, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.time import local_now, utcnow
from app.models import Asset, AssetCategory, AssetEntry, HandoverAsset, HandoverLog, Shift, ShiftHandover, User
from app.schemas.asset import AssetEntryOut, AssetResponse
from app.schemas.handover import HandoverAssetUpdate, HandoverResponse
from app.services import catalog
from app.services.asset_history import add_entry

logger = logging.getLogger(__name__)

NOT_SPECIFIED = "Не указано"


def validate_asset_ids(db: Session, asset_ids: Iterable[int]) -> List[int]:
    """Убираем дубли и проверяем, что все активы существуют."""
    unique_ids = list(dict.fromkeys(asset_ids))
    if not unique_ids:
        return []
    found = {row[0] for row in db.query(Asset.id).filter(Asset.id.in_(unique_ids)).all()}
    missing = [asset_id for asset_id in unique_ids if asset_id not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Активы не найдены: {', '.join(map(str, missing))}",
        )
    return unique_ids


def validate_shift_ids(db: Session, *shift_ids: Optional[int]) -> None:
    for shift_id in shift_ids:
        if shift_id is not None and not db.get(Shift, shift_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Смена {shift_id} не найдена")


def resolve_wave(db: Session, wave: Optional[int], from_shift_id: Optional[int], author: User) -> int:
    """Волна передачи: указанная явно, иначе — волна сотрудника сдающей смены, иначе — автора."""
    if wave:
        return wave
    shift = db.get(Shift, from_shift_id) if from_shift_id else None
    owner = db.get(User, shift.user_id) if shift else None
    return (owner or author).wave or 1


def link_assets(db: Session, handover_id: int, asset_ids: Iterable[int]) -> None:
    db.add_all(HandoverAsset(handover_id=handover_id, asset_id=asset_id) for asset_id in asset_ids)


def apply_updates(
    db: Session,
    handover: ShiftHandover,
    updates: List[HandoverAssetUpdate],
    user: User,
) -> None:
    """Меняет статусы активов и пишет заметки в их историю с пометкой этой передачи."""
    for update in updates:
        asset = db.get(Asset, update.asset_id)
        if not asset:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Актив {update.asset_id} не найден")
        old_status = asset.status
        new_status = catalog.resolve_status(db, update.status) if update.status else old_status
        if new_status == old_status and not update.text:
            continue
        asset.status = new_status
        asset.updated_at = utcnow()
        kind = "status" if new_status != old_status else "comment"
        add_entry(
            db, asset, user, kind, text=update.text,
            old_status=old_status if kind == "status" else None,
            new_status=new_status if kind == "status" else None,
            shift_id=handover.from_shift_id, handover_id=handover.id,
        )


def assets_by_handover(db: Session, handover_ids: List[int]) -> Dict[int, List[Asset]]:
    """Один запрос на все активы всех передач вместо запроса на каждую передачу."""
    result: Dict[int, List[Asset]] = defaultdict(list)
    if not handover_ids:
        return result
    rows = (
        db.query(HandoverAsset.handover_id, Asset)
        .join(Asset, Asset.id == HandoverAsset.asset_id)
        .filter(HandoverAsset.handover_id.in_(handover_ids))
        .order_by(HandoverAsset.id)
        .all()
    )
    for handover_id, asset in rows:
        result[handover_id].append(asset)
    return result


def entries_by_handover(db: Session, handover_ids: List[int]) -> Dict[int, List[AssetEntry]]:
    result: Dict[int, List[AssetEntry]] = defaultdict(list)
    if not handover_ids:
        return result
    entries = (
        db.query(AssetEntry)
        .filter(AssetEntry.handover_id.in_(handover_ids))
        .order_by(AssetEntry.id)
        .all()
    )
    for entry in entries:
        result[entry.handover_id].append(entry)
    return result


def to_response(handover: ShiftHandover, assets: List[Asset], entries: List[AssetEntry]) -> HandoverResponse:
    return HandoverResponse(
        id=handover.id,
        from_shift_id=handover.from_shift_id,
        to_shift_id=handover.to_shift_id,
        wave=handover.wave or 1,
        handover_notes=handover.handover_notes,
        assets=[AssetResponse.model_validate(asset) for asset in assets],
        entries=[AssetEntryOut.model_validate(entry) for entry in entries],
        created_at=handover.created_at,
    )


def build_responses(db: Session, handovers: List[ShiftHandover]) -> List[HandoverResponse]:
    ids = [h.id for h in handovers]
    assets_map = assets_by_handover(db, ids)
    entries_map = entries_by_handover(db, ids)
    return [to_response(h, assets_map.get(h.id, []), entries_map.get(h.id, [])) for h in handovers]


def _shift_label(shift: Optional[Shift]) -> tuple:
    if not shift:
        return NOT_SPECIFIED, NOT_SPECIFIED
    return shift.user_name, f"{shift.start_time}-{shift.end_time}"


def write_log(db: Session, handover: ShiftHandover, assets: List[Asset], entries: List[AssetEntry]) -> None:
    """Журнал не должен ломать саму передачу — ошибки только логируем."""
    try:
        from_user, from_time = _shift_label(db.get(Shift, handover.from_shift_id) if handover.from_shift_id else None)
        to_user, to_time = _shift_label(db.get(Shift, handover.to_shift_id) if handover.to_shift_id else None)
        categories = {key: name for key, name in db.query(AssetCategory.key, AssetCategory.name).all()}
        statuses = catalog.status_names(db)
        notes_by_asset = defaultdict(list)
        for entry in entries:
            if entry.text:
                notes_by_asset[entry.asset_id].append(entry.text)

        def describe(asset: Asset) -> str:
            category = categories.get(asset.asset_type, asset.asset_type)
            status_name = statuses.get(asset.status, asset.status)
            notes = " / ".join(notes_by_asset.get(asset.id, [])) or asset.description
            return f"{asset.title} ({category}, {status_name}): {notes}"

        now = local_now()
        db.add(HandoverLog(
            log_date=now.strftime("%Y-%m-%d"),
            log_time=now.strftime("%H:%M:%S"),
            from_shift_user=from_user,
            from_shift_time=from_time,
            to_shift_user=to_user,
            to_shift_time=to_time,
            handover_notes=handover.handover_notes,
            assets_info="; ".join(describe(a) for a in assets) or "Нет активов",
        ))
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("Не удалось записать журнал передачи %s", handover.id)
