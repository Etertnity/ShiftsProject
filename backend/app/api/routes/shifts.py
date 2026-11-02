"""График смен."""
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_active_user
from app.db.session import get_db
from app.models import Shift, User
from app.schemas.common import Message
from app.schemas.shift import (
    DATE_PATTERN,
    ScheduleGenerate,
    ScheduleGenerateResult,
    ShiftAssign,
    ShiftBulkCreate,
    ShiftCreate,
    ShiftResponse,
    ShiftSplit,
    ShiftStats,
    ShiftSwap,
    Timesheet,
)
from app.services import excel_schedule, schedule

router = APIRouter(prefix="/api/shifts", tags=["shifts"], dependencies=[Depends(get_current_active_user)])


def _get_shift_or_404(db: Session, shift_id: int) -> Shift:
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Смена не найдена")
    return shift


def _get_employee(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Сотрудник с id {user_id} не найден")
    return user


def _guard(user: User, *shifts) -> None:
    """Начавшиеся и прошедшие смены — это уже факт отработки: менять их может только администратор.
    shifts — модели Shift или ShiftCreate (дата и время начала)."""
    if user.is_admin:
        return
    if any(schedule.has_started(item.date, item.start_time) for item in shifts):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=schedule.PAST_LOCKED)


def _build_shift(data: ShiftCreate, user: User) -> Shift:
    return Shift(**data.model_dump(), user_name=user.name, position=user.position)


def _saved(db: Session, shift: Shift) -> Shift:
    db.commit()
    db.refresh(shift)
    return shift


@router.get("/", response_model=List[ShiftResponse])
def list_shifts(
    date: Optional[str] = Query(default=None, pattern=DATE_PATTERN),
    date_from: Optional[str] = Query(default=None, pattern=DATE_PATTERN),
    date_to: Optional[str] = Query(default=None, pattern=DATE_PATTERN),
    db: Session = Depends(get_db),
):
    query = db.query(Shift).options(selectinload(Shift.segments))
    if date:
        query = query.filter(Shift.date == date)
    if date_from:
        query = query.filter(Shift.date >= date_from)
    if date_to:
        query = query.filter(Shift.date <= date_to)
    return query.order_by(Shift.date.desc(), Shift.start_time.desc(), Shift.id.desc()).all()


@router.post("/", response_model=ShiftResponse)
def create_shift(shift_in: ShiftCreate, db: Session = Depends(get_db), current: User = Depends(get_current_active_user)):
    _guard(current, shift_in)
    shift = _build_shift(shift_in, _get_employee(db, shift_in.user_id))
    db.add(shift)
    return _saved(db, shift)


# Статические пути объявлены раньше /{shift_id}, иначе они перехватывались бы как id

@router.post("/bulk", response_model=List[ShiftResponse])
def create_shifts_bulk(payload: ShiftBulkCreate, db: Session = Depends(get_db), current: User = Depends(get_current_active_user)):
    _guard(current, *payload.shifts)
    # Сначала проверяем всех сотрудников, чтобы не создать часть смен и упасть на середине
    users = {item.user_id: _get_employee(db, item.user_id) for item in payload.shifts}
    shifts = [_build_shift(item, users[item.user_id]) for item in payload.shifts]
    db.add_all(shifts)
    db.commit()
    for shift in shifts:
        db.refresh(shift)
    return shifts


@router.post("/generate", response_model=ScheduleGenerateResult)
def generate_schedule(params: ScheduleGenerate, db: Session = Depends(get_db), current: User = Depends(get_current_active_user)):
    """Автозаполнение графика по циклу «день → ночь → отсыпной → выходной». С preview=true ничего не сохраняет.
    Не администратор заполняет только будущие смены."""
    return schedule.generate(db, params, allow_past=current.is_admin)


@router.get("/stats", response_model=ShiftStats)
def shift_stats(
    date_from: str = Query(pattern=DATE_PATTERN),
    date_to: str = Query(pattern=DATE_PATTERN),
    db: Session = Depends(get_db),
):
    if date.fromisoformat(date_to) < date.fromisoformat(date_from):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Дата окончания раньше даты начала")
    return ShiftStats(date_from=date_from, date_to=date_to, items=schedule.stats(db, date_from, date_to))


@router.get("/timesheet", response_model=Timesheet)
def timesheet(
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    """Табель месяца в раскладке Excel-файла графика: «отработано» и «станд.график» по каждому сотруднику."""
    year, number = excel_schedule.parse_month(month)
    return excel_schedule.build_timesheet(db, year, number)


@router.post("/swap", response_model=List[ShiftResponse])
def swap_shifts(payload: ShiftSwap, db: Session = Depends(get_db), current: User = Depends(get_current_active_user)):
    """Рокировка: две смены меняются сотрудниками целиком."""
    first_id, second_id = payload.shift_ids
    if first_id == second_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Выберите две разные смены")
    first, second = _get_shift_or_404(db, first_id), _get_shift_or_404(db, second_id)
    _guard(current, first, second)
    first_user, second_user = first.user_id, second.user_id
    schedule.assign(db, first, second_user)
    schedule.assign(db, second, first_user)
    db.commit()
    db.refresh(first)
    db.refresh(second)
    return [first, second]


@router.get("/{shift_id}", response_model=ShiftResponse)
def get_shift(shift_id: int, db: Session = Depends(get_db)):
    return _get_shift_or_404(db, shift_id)


@router.put("/{shift_id}", response_model=ShiftResponse)
def update_shift(shift_id: int, shift_in: ShiftCreate, db: Session = Depends(get_db), current: User = Depends(get_current_active_user)):
    shift = _get_shift_or_404(db, shift_id)
    # Нельзя ни править начавшуюся смену, ни перенести будущую в прошлое
    _guard(current, shift, shift_in)
    # Сменилось время или сотрудник — прежнее разделение смены больше не соответствует
    timing_changed = (shift.date, shift.start_time, shift.end_time) != (shift_in.date, shift_in.start_time, shift_in.end_time)
    if timing_changed or shift.user_id != shift_in.user_id:
        shift.segments = []
    for key, value in shift_in.model_dump().items():
        setattr(shift, key, value)
    user = _get_employee(db, shift_in.user_id)
    shift.user_name = user.name
    shift.position = user.position
    return _saved(db, shift)


@router.post("/{shift_id}/assign", response_model=ShiftResponse)
def assign_shift(shift_id: int, payload: ShiftAssign, db: Session = Depends(get_db), current: User = Depends(get_current_active_user)):
    """Замена дежурного на всю смену (заболел, поменялись и т.п.)."""
    shift = _get_shift_or_404(db, shift_id)
    _guard(current, shift)
    schedule.assign(db, shift, payload.user_id)
    return _saved(db, shift)


@router.put("/{shift_id}/split", response_model=ShiftResponse)
def split_shift(shift_id: int, payload: ShiftSplit, db: Session = Depends(get_db), current: User = Depends(get_current_active_user)):
    """Разделить смену между сотрудниками по времени (например, 09–15 и 15–21)."""
    shift = _get_shift_or_404(db, shift_id)
    _guard(current, shift)
    schedule.apply_split(db, shift, payload.parts)
    return _saved(db, shift)


@router.delete("/{shift_id}", response_model=Message)
def delete_shift(shift_id: int, db: Session = Depends(get_db), current: User = Depends(get_current_active_user)):
    shift = _get_shift_or_404(db, shift_id)
    _guard(current, shift)
    db.delete(shift)
    db.commit()
    return Message(message="Смена удалена")
