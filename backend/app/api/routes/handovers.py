"""Передачи смен."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_current_admin_user
from app.db.session import get_db
from app.models import AssetEntry, HandoverAsset, HandoverLog, ShiftHandover, User
from app.schemas.common import Message
from app.schemas.handover import (
    HandoverClearResult,
    HandoverCreate,
    HandoverExport,
    HandoverLogItem,
    HandoverResponse,
)
from app.services import handovers as service

router = APIRouter(prefix="/api/handovers", tags=["handovers"])


def _get_handover_or_404(db: Session, handover_id: int) -> ShiftHandover:
    handover = db.get(ShiftHandover, handover_id)
    if not handover:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Передача смены не найдена")
    return handover


# ВАЖНО: статические пути (/export, /clear) объявлены раньше /{handover_id},
# иначе FastAPI пытается распарсить "export" как id и возвращает 422.

@router.get("/export", response_model=HandoverExport)
def export_handovers(db: Session = Depends(get_db), _: User = Depends(get_current_active_user)):
    logs = db.query(HandoverLog).order_by(HandoverLog.created_at.desc(), HandoverLog.id.desc()).all()
    data = [
        HandoverLogItem(
            id=log.id,
            date=log.log_date,
            time=log.log_time,
            from_shift_user=log.from_shift_user,
            from_shift_time=log.from_shift_time,
            to_shift_user=log.to_shift_user,
            to_shift_time=log.to_shift_time,
            handover_notes=log.handover_notes,
            assets_info=log.assets_info,
        )
        for log in logs
    ]
    return HandoverExport(data=data, total=len(data))


@router.delete("/clear", response_model=HandoverClearResult)
def clear_handovers(db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    handovers_count = db.query(ShiftHandover).count()
    logs_count = db.query(HandoverLog).count()
    db.query(HandoverAsset).delete()
    db.query(AssetEntry).filter(AssetEntry.handover_id.isnot(None)).update({AssetEntry.handover_id: None})
    db.query(ShiftHandover).delete()
    db.query(HandoverLog).delete()
    db.commit()
    return HandoverClearResult(
        message=f"Удалено {handovers_count} передач смен и {logs_count} записей журнала",
        deleted_handovers=handovers_count,
        deleted_logs=logs_count,
    )


@router.get("/", response_model=List[HandoverResponse])
def list_handovers(
    response: Response,
    # Журнал растёт на 2–3 передачи в день, в каждой — десятки кейсов: отдаём страницами
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    query = db.query(ShiftHandover)
    response.headers["X-Total-Count"] = str(query.count())
    handovers = (
        query.order_by(ShiftHandover.created_at.desc(), ShiftHandover.id.desc()).offset(offset).limit(limit).all()
    )
    return service.build_responses(db, handovers)


def _asset_ids_with_updates(db: Session, handover_in: HandoverCreate) -> List[int]:
    # Активы, по которым есть обновления, всегда входят в передачу
    return service.validate_asset_ids(db, [*handover_in.asset_ids, *(u.asset_id for u in handover_in.updates)])


@router.post("/", response_model=HandoverResponse)
def create_handover(
    handover_in: HandoverCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    service.validate_shift_ids(db, handover_in.from_shift_id, handover_in.to_shift_id)
    asset_ids = _asset_ids_with_updates(db, handover_in)

    handover = ShiftHandover(**handover_in.model_dump(exclude={"asset_ids", "updates"}))
    db.add(handover)
    db.flush()  # получаем id, но коммитим передачу, связи и обновления активов одной транзакцией
    service.link_assets(db, handover.id, asset_ids)
    service.apply_updates(db, handover, handover_in.updates, user)
    db.commit()
    db.refresh(handover)

    response = service.build_responses(db, [handover])[0]
    assets = service.assets_by_handover(db, [handover.id]).get(handover.id, [])
    entries = service.entries_by_handover(db, [handover.id]).get(handover.id, [])
    service.write_log(db, handover, assets, entries)
    return response


@router.get("/{handover_id}", response_model=HandoverResponse)
def get_handover(handover_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_active_user)):
    return service.build_responses(db, [_get_handover_or_404(db, handover_id)])[0]


@router.put("/{handover_id}", response_model=HandoverResponse)
def update_handover(
    handover_id: int,
    handover_in: HandoverCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    handover = _get_handover_or_404(db, handover_id)
    service.validate_shift_ids(db, handover_in.from_shift_id, handover_in.to_shift_id)
    asset_ids = _asset_ids_with_updates(db, handover_in)

    for key, value in handover_in.model_dump(exclude={"asset_ids", "updates"}).items():
        setattr(handover, key, value)
    db.query(HandoverAsset).filter(HandoverAsset.handover_id == handover_id).delete()
    service.link_assets(db, handover.id, asset_ids)
    # Новые обновления добавляются к истории; прежние записи не переписываем
    service.apply_updates(db, handover, handover_in.updates, user)
    db.commit()
    db.refresh(handover)
    return service.build_responses(db, [handover])[0]


@router.delete("/{handover_id}", response_model=Message)
def delete_handover(handover_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    # Передача — журнал работы смены; удалять её может только администратор
    handover = _get_handover_or_404(db, handover_id)
    db.query(HandoverAsset).filter(HandoverAsset.handover_id == handover_id).delete()
    # Записи в истории активов остаются — это факты о работе, просто без привязки к передаче
    db.query(AssetEntry).filter(AssetEntry.handover_id == handover_id).update({AssetEntry.handover_id: None})
    db.delete(handover)
    db.commit()
    return Message(message="Передача смены удалена")
