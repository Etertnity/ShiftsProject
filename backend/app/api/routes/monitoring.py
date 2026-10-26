"""ICMP-монитор судов: список судов и история потерь из Zabbix (через сервер)."""
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_current_admin_user
from app.core.config import settings
from app.db.session import get_db
from app.models import User, Vessel
from app.schemas.common import Message
from app.schemas.monitoring import MonitorConfig, VesselCreate, VesselHistory, VesselOut, VesselUpdate
from app.services.zabbix import ZabbixError, ZabbixNotConfigured, parse_item_id, zabbix

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"], dependencies=[Depends(get_current_active_user)])

PERIODS = (1, 3, 6, 12, 24)


def _parse_item(value: str) -> str:
    item_id = parse_item_id(value)
    if not item_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не нашёл Item ID. Вставьте ссылку на график Zabbix (…itemids%5B%5D=12345) или само число",
        )
    return item_id


def _ensure_item_free(db: Session, item_id: str, exclude_id: int = 0) -> None:
    existing = db.query(Vessel).filter(Vessel.item_id == item_id, Vessel.id != exclude_id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Item {item_id} уже есть в списке: «{existing.name}»")


def _get_vessel_or_404(db: Session, vessel_id: int) -> Vessel:
    vessel = db.get(Vessel, vessel_id)
    if not vessel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Судно не найдено")
    return vessel


@router.get("/config", response_model=MonitorConfig)
def monitor_config():
    return MonitorConfig(
        configured=settings.zabbix_configured,
        web_url=settings.zabbix_web_url or None,
        warn_threshold=settings.monitor_warn_threshold,
        crit_threshold=settings.monitor_crit_threshold,
    )


@router.get("/vessels", response_model=List[VesselOut])
def list_vessels(db: Session = Depends(get_db)):
    return db.query(Vessel).order_by(Vessel.position, Vessel.id).all()


@router.post("/vessels", response_model=VesselOut)
def create_vessel(data: VesselCreate, db: Session = Depends(get_db)):
    item_id = _parse_item(data.item)
    _ensure_item_free(db, item_id)
    position = db.query(Vessel).count()
    vessel = Vessel(item_id=item_id, name=data.name, position=position)
    db.add(vessel)
    db.commit()
    db.refresh(vessel)
    return vessel


@router.put("/vessels/{vessel_id}", response_model=VesselOut)
def update_vessel(vessel_id: int, data: VesselUpdate, db: Session = Depends(get_db)):
    vessel = _get_vessel_or_404(db, vessel_id)
    if data.item:
        item_id = _parse_item(data.item)
        _ensure_item_free(db, item_id, exclude_id=vessel.id)
        vessel.item_id = item_id
    if data.name is not None:
        vessel.name = data.name
    if data.is_hidden is not None:
        vessel.is_hidden = data.is_hidden
    db.commit()
    db.refresh(vessel)
    return vessel


@router.delete("/vessels/{vessel_id}", response_model=Message)
def delete_vessel(vessel_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    db.delete(_get_vessel_or_404(db, vessel_id))
    db.commit()
    return Message(message="Судно удалено")


@router.get("/history/{item_id}", response_model=VesselHistory)
async def vessel_history(
    item_id: str,
    hours: Optional[int] = Query(default=None),
    since: Optional[int] = Query(default=None, description="Дозагрузка: точки новее этого unix-времени"),
    db: Session = Depends(get_db),
):
    # Читаем только графики судов из списка — через API нельзя вытащить произвольный item из Zabbix
    if not db.query(Vessel.id).filter(Vessel.item_id == item_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Такого судна нет в списке")
    try:
        if since is not None:
            # Дозагрузка не может уходить дальше суток назад
            time_from = max(since, int(time.time()) - 25 * 3600)
            points = await zabbix.history(item_id, time_from)
        else:
            if hours not in PERIODS:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Период: один из {PERIODS} часов")
            points = await zabbix.history_for_period(item_id, hours)
    except ZabbixNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ZabbixError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return VesselHistory(item_id=item_id, points=points)
