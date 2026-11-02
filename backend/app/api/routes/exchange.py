"""Обмен с Excel: передачи и кейсы, график смен в формате файла «График сменных»."""
import json
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_current_admin_user
from app.db.session import get_db
from app.models import User
from app.schemas.exchange import ImportPreview, ImportResult
from app.schemas.shift import ScheduleImportPreview, ScheduleImportResult
from app.services import excel_exchange as service
from app.services import excel_schedule
from app.services.schedule import now_local

router = APIRouter(prefix="/api/exchange", tags=["exchange"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def _read(file: UploadFile) -> bytes:
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нужен файл Excel в формате .xlsx")
    # Читаем не больше лимита + 1 байт — огромный файл не попадёт в память целиком
    content = await file.read(service.MAX_UPLOAD_BYTES + 1)
    if len(content) > service.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Файл больше 5 МБ")
    return content


@router.get("/export.xlsx")
def export_xlsx(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    """Передачи (в формате ручного журнала), все кейсы и их история за период."""
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Начало периода позже конца")
    content = service.export_workbook(db, date_from, date_to)
    suffix = f"_{date_from or ''}_{date_to or ''}" if date_from or date_to else ""
    filename = f"shift-handovers{suffix}.xlsx"
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import/preview", response_model=ImportPreview)
async def import_preview(
    file: UploadFile = File(...),
    mapping: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    """Что будет загружено: колонки, их сопоставление с категориями и разобранные строки. Ничего не сохраняет."""
    return service.preview(db, await _read(file), mapping)


@router.post("/import", response_model=ImportResult)
async def import_xlsx(
    file: UploadFile = File(...),
    mapping: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_admin_user),
):
    """Загрузка журнала передач. Уже загруженные строки (та же смена и сотрудник) пропускаются."""
    stats = service.apply_import(db, await _read(file), mapping, user)
    return ImportResult(**stats.__dict__)


# --- График смен -------------------------------------------------------------------

@router.get("/schedule.xlsx")
def export_schedule(
    month_from: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    month_to: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    """График в формате листа «Общее»: блоки месяцев, «отработано» и «станд.график» по каждому сотруднику."""
    current = now_local().strftime("%Y-%m")
    month_from = month_from or month_to or current
    month_to = month_to or month_from
    months = excel_schedule.month_range(month_from, month_to)
    content = excel_schedule.export_workbook(db, months)
    suffix = month_from if month_from == month_to else f"{month_from}_{month_to}"
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="shift-schedule_{suffix}.xlsx"'},
    )


@router.post("/schedule/preview", response_model=ScheduleImportPreview)
async def schedule_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    """Какие месяцы и сотрудники найдены в файле и что изменится в графике. Ничего не сохраняет."""
    return excel_schedule.preview(db, await _read(file))


@router.post("/schedule/import", response_model=ScheduleImportResult)
async def schedule_import(
    file: UploadFile = File(...),
    months: Optional[str] = Form(default=None),
    mode: str = Form(default="update"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    """Загрузка графика. Смены, которых нет в файле, не удаляются."""
    if mode not in ("update", "fill"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неизвестный режим загрузки")
    selected = None
    if months:
        try:
            selected = json.loads(months)
        except ValueError:
            selected = None
        if not isinstance(selected, list) or not all(isinstance(m, str) for m in selected) or len(selected) > 120:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный список месяцев")
    return excel_schedule.apply_import(db, await _read(file), selected, mode)
