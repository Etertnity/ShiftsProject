"""График смен: интервалы, разделение смены, автозаполнение по циклу и статистика часов.

Время смен — московское (как в интерфейсе), поэтому здесь работаем с naive datetime по МСК.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.time import local_now
from app.models import Shift, ShiftSegment, User
from app.schemas.shift import GeneratedShift, ScheduleGenerate, ScheduleGenerateResult, ShiftPart, ShiftStatsItem

DAY_PRESET = ("09:00", "21:00")
NIGHT_PRESET = ("21:00", "09:00")


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def now_local() -> datetime:
    return local_now().replace(tzinfo=None)


PAST_LOCKED = "Начавшиеся и прошедшие смены может менять только администратор"


def has_started(date_key: str, start_time: str, now: Optional[datetime] = None) -> bool:
    """Смена уже началась — по ней есть факт отработки, и менять её может только администратор."""
    return datetime.fromisoformat(f"{date_key}T{start_time}") <= (now or now_local())


def shift_interval(shift: Shift) -> Tuple[datetime, datetime]:
    start = datetime.fromisoformat(f"{shift.date}T{shift.start_time}")
    end = datetime.fromisoformat(f"{shift.date}T{shift.end_time}")
    if end <= start:
        end += timedelta(days=1)  # ночная смена заканчивается на следующий день
    return start, end


def work_parts(shift: Shift) -> List[Tuple[int, str, datetime, datetime]]:
    """Кто и когда работал в смене: части из segments, а если их нет — вся смена за назначенным."""
    if shift.segments:
        return [(s.user_id, s.user_name, s.start_at, s.end_at) for s in shift.segments]
    start, end = shift_interval(shift)
    return [(shift.user_id, shift.user_name, start, end)]


# --- Разделение смены ----------------------------------------------------------

def apply_split(db: Session, shift: Shift, parts: List[ShiftPart]) -> None:
    """Заменяет части смены. Одна часть или пусто — смена целиком за одним сотрудником."""
    shift.segments = []
    if len(parts) <= 1:
        if parts:
            _assign(db, shift, parts[0].user_id)
        return

    start, end = shift_interval(shift)
    moments = [datetime.fromisoformat(p.start_at) for p in parts]
    if moments[0] != start:
        raise _bad_request("Первая часть должна начинаться с начала смены")
    for prev, cur in zip(moments, moments[1:]):
        if not prev < cur < end:
            raise _bad_request("Время передачи должно идти по порядку внутри смены")

    users = {u.id: u for u in db.query(User).filter(User.id.in_([p.user_id for p in parts])).all()}
    bounds = moments + [end]
    for index, part in enumerate(parts):
        user = users.get(part.user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Сотрудник с id {part.user_id} не найден")
        if index and part.user_id == parts[index - 1].user_id:
            raise _bad_request("Соседние части смены должны быть за разными сотрудниками")
        shift.segments.append(ShiftSegment(user_id=user.id, user_name=user.name, start_at=bounds[index], end_at=bounds[index + 1]))
    # Ответственным по смене считаем того, кто её начал
    _assign(db, shift, parts[0].user_id, clear_segments=False)


def _assign(db: Session, shift: Shift, user_id: int, clear_segments: bool = True) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Сотрудник с id {user_id} не найден")
    shift.user_id = user.id
    shift.user_name = user.name
    shift.position = user.position
    if clear_segments:
        shift.segments = []


def assign(db: Session, shift: Shift, user_id: int) -> None:
    _assign(db, shift, user_id)


# --- Автозаполнение ------------------------------------------------------------

def _daterange(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def generate(db: Session, params: ScheduleGenerate, allow_past: bool = True) -> ScheduleGenerateResult:
    """
    allow_past=False (не администратор): начавшиеся смены не создаются и не удаляются.
    Цикл «день → ночь → отсыпной → выходной»: кто работает днём D, выходит в ночь D+1,
    а следующий его день — через N дней (N — число сотрудников в ротации).
    Сотрудники идут по порядку: первый днём в date_from, второй днём в date_from+1 и т.д.
    """
    date_from = date.fromisoformat(params.date_from)
    date_to = date.fromisoformat(params.date_to)
    if date_to < date_from:
        raise _bad_request("Дата окончания раньше даты начала")
    if (date_to - date_from).days > 92:
        raise _bad_request("За один раз можно заполнить не больше трёх месяцев")
    if len(set(params.user_ids)) != len(params.user_ids):
        raise _bad_request("Сотрудник указан в ротации дважды")

    users = {u.id: u for u in db.query(User).filter(User.id.in_(params.user_ids)).all()}
    missing = [uid for uid in params.user_ids if uid not in users]
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Сотрудники не найдены: {missing}")
    order = [users[uid] for uid in params.user_ids]
    n = len(order)

    warnings: List[str] = []
    if n == 3:
        warnings.append("При трёх сотрудниках после ночи только один выходной. Для цикла «день-ночь-отсыпной-выходной» нужно четверо.")

    existing = (
        db.query(Shift)
        .filter(Shift.date >= params.date_from, Shift.date <= params.date_to)
        .all()
    )
    now = now_local()
    locked_slots = set()
    if not allow_past:
        # Начавшиеся смены остаются как есть: их слоты заняты и в режиме «построить заново»
        locked_slots = {(s.date, s.shift_type) for s in existing if has_started(s.date, s.start_time, now)}
        existing = [s for s in existing if not has_started(s.date, s.start_time, now)]
    occupied = {(s.date, s.shift_type) for s in existing}
    past_skipped = 0

    planned: List[GeneratedShift] = []
    skipped = 0
    for offset, day in enumerate(_daterange(date_from, date_to)):
        day_key = day.isoformat()
        day_worker = order[offset % n]
        # Ночью работает тот, кто был днём накануне (в первый день — последний в ротации)
        night_worker = order[(offset - 1) % n]
        for shift_type, worker, (start, end) in (
            ("day", day_worker, DAY_PRESET),
            ("night", night_worker, NIGHT_PRESET),
        ):
            if not allow_past and has_started(day_key, start, now):
                past_skipped += 1
                continue
            if (day_key, shift_type) in locked_slots or (params.mode == "fill" and (day_key, shift_type) in occupied):
                skipped += 1
                continue
            planned.append(GeneratedShift(
                date=day_key, shift_type=shift_type, start_time=start, end_time=end,
                user_id=worker.id, user_name=worker.name,
            ))

    if past_skipped:
        warnings.append(f"Пропущено начавшихся и прошедших смен: {past_skipped} — их меняет только администратор.")
    removed = len(existing) if params.mode == "replace" else 0
    if params.preview:
        return ScheduleGenerateResult(shifts=planned, created=0, skipped=skipped, removed=removed, warnings=warnings)

    if params.mode == "replace":
        for shift in existing:
            db.delete(shift)
    for item in planned:
        user = users[item.user_id]
        db.add(Shift(
            date=item.date, start_time=item.start_time, end_time=item.end_time, shift_type=item.shift_type,
            user_id=user.id, user_name=user.name, position=user.position,
        ))
    db.commit()
    return ScheduleGenerateResult(shifts=planned, created=len(planned), skipped=skipped, removed=removed, warnings=warnings)


# --- Статистика ----------------------------------------------------------------

def stats(db: Session, date_from: str, date_to: str, now: Optional[datetime] = None) -> List[ShiftStatsItem]:
    """
    Смены и часы по каждому сотруднику за период. «Отработано» — только завершившиеся смены;
    если смену разделили, каждый получает свои часы, а смена считается частичной.
    """
    now = now or now_local()
    shifts = db.query(Shift).filter(Shift.date >= date_from, Shift.date <= date_to).all()
    names = {u.id: u.name for u in db.query(User).all()}

    acc: Dict[int, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    fallback_names: Dict[int, str] = {}
    for shift in shifts:
        parts = work_parts(shift)
        _, end = shift_interval(shift)
        finished = end <= now
        partial = len({p[0] for p in parts}) > 1
        hours_by_user: Dict[int, float] = defaultdict(float)
        for user_id, user_name, start_at, end_at in parts:
            hours_by_user[user_id] += (end_at - start_at).total_seconds() / 3600
            fallback_names.setdefault(user_id, user_name)
        for user_id, hours in hours_by_user.items():
            row = acc[user_id]
            row["planned_shifts"] += 1
            row["planned_hours"] += hours
            row["night_shifts" if shift.shift_type == "night" else "day_shifts"] += 1
            if partial:
                row["partial_shifts"] += 1
            if finished:
                row["worked_shifts"] += 1
                row["worked_hours"] += hours

    items = [
        ShiftStatsItem(
            user_id=user_id,
            name=names.get(user_id) or fallback_names.get(user_id, f"#{user_id}"),
            planned_shifts=int(row["planned_shifts"]),
            planned_hours=round(row["planned_hours"], 1),
            worked_shifts=int(row["worked_shifts"]),
            worked_hours=round(row["worked_hours"], 1),
            day_shifts=int(row["day_shifts"]),
            night_shifts=int(row["night_shifts"]),
            partial_shifts=int(row["partial_shifts"]),
        )
        for user_id, row in acc.items()
    ]
    return sorted(items, key=lambda item: (-item.worked_hours, -item.planned_hours, item.name))
