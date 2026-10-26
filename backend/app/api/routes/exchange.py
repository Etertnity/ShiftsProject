"""Обмен с Excel: выгрузка передач и кейсов, загрузка журнала передач."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_current_admin_user
from app.db.session import get_db
from app.models import User
from app.schemas.exchange import ImportPreview, ImportResult
from app.services import excel_exchange as service

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
