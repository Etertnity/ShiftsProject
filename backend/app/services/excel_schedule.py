"""График смен в формате Excel-файла «График сменных» (лист «Общее»): табель, выгрузка и загрузка.

Раскладка файла — месяцы блоками сверху вниз:

    D            | E   F   | G   H   | … | BM  BN  | BO
    2026         |         |   …  Ноябрь (в AI)    |
    число        |    1    |    2    | … |   31    | кол-во смен
    день недели  |   Вс    |   Пн    | … |         |
    смена        | д   н   | д   н   | … | д   н   |
    (пусто)
    Имя отработано     | 12 |   |   | 12 | …        | =SUM(E:BN)/12
    Имя станд.график   | 12 |   |   | 12 | …        | =SUM(E:BN)/12
    (пусто)
    …

В ячейке — часы. Цвет ячейки: зелёный — отработано, жёлтый — не по стандартному графику,
красный — не отработано, голубой — праздник. Ночная смена стоит в колонке «н» дня, когда она началась.
Строка «отработано» — факт, «станд.график» — исходный план.
"""
import io
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException, status
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session, selectinload

from app.models import Shift, User
from app.schemas.shift import (
    ScheduleImportMonth,
    ScheduleImportPreview,
    ScheduleImportResult,
    ShiftPart,
    Timesheet,
    TimesheetCell,
    TimesheetDay,
    TimesheetRow,
)
from app.services import schedule
from app.services.excel_exchange import _clean, _norm, open_workbook

MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
               "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
WORKED_SUFFIX = "отработано"
STANDARD_SUFFIX = "станд.график"

# Колонки как в файле: D — подписи и имена, E… — пары «д/н» по дням, BO — количество смен
LABEL_COL = 4
FIRST_DAY_COL = 5
COUNT_COL = FIRST_DAY_COL + 31 * 2  # BO
MONTH_TITLE_COL = 35  # AI

FILL_WORKED = "92D050"
FILL_CHANGED = "FFFF00"
FILL_MISSED = "FF0000"
FILL_HOLIDAY = "00B0F0"
STATUS_FILLS = {"worked": FILL_WORKED, "changed": FILL_CHANGED, "missed": FILL_MISSED}

MAX_MONTHS = 36
STEP_MINUTES = 5
MAX_SCAN_ROWS = 6000
MAX_SCAN_COLS = 80

_MONTH_RE = re.compile(r"(?<![а-яё])(" + "|".join(m.lower() for m in MONTH_NAMES) + r")(?![а-яё])")


def month_key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def parse_month(value: str) -> Tuple[int, int]:
    match = re.fullmatch(r"(\d{4})-(\d{2})", value or "")
    if not match or not 1 <= int(match.group(2)) <= 12:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Месяц нужно указать в виде ГГГГ-ММ")
    return int(match.group(1)), int(match.group(2))


def month_range(month_from: str, month_to: str) -> List[Tuple[int, int]]:
    start, end = parse_month(month_from), parse_month(month_to)
    if end < start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Начало периода позже конца")
    months = []
    year, month = start
    while (year, month) <= end:
        months.append((year, month))
        if len(months) > MAX_MONTHS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"За раз можно выгрузить не больше {MAX_MONTHS} месяцев")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def _days_in_month(year: int, month: int) -> int:
    nxt = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return (nxt - timedelta(days=1)).day


def _hours(start: datetime, end: datetime) -> float:
    return round((end - start).total_seconds() / 3600, 2)


def _number(value: float):
    """12.0 → 12, 4.5 → 4.5 — в Excel целые часы без «,0»."""
    return int(value) if float(value).is_integer() else value


# =============================================================================
# Табель
# =============================================================================

def build_timesheet(db: Session, year: int, month: int, now: Optional[datetime] = None) -> Timesheet:
    """
    Табель месяца. «Станд.график» — за кем смена числится, на всю её длину.
    «Отработано» — кто и сколько часов фактически отработал (части разделённой смены).
    """
    now = now or schedule.now_local()
    days = _days_in_month(year, month)
    first, last = f"{month_key(year, month)}-01", f"{month_key(year, month)}-{days:02d}"
    shifts = (
        db.query(Shift)
        .options(selectinload(Shift.segments))
        .filter(Shift.date >= first, Shift.date <= last)
        .order_by(Shift.date, Shift.start_time, Shift.id)
        .all()
    )
    names = {u.id: u.name for u in db.query(User).all()}

    worked: Dict[int, Dict[Tuple[int, str], float]] = defaultdict(lambda: defaultdict(float))
    standard: Dict[int, Dict[Tuple[int, str], float]] = defaultdict(lambda: defaultdict(float))
    finished: Dict[Tuple[int, str], bool] = {}
    fallback: Dict[int, str] = {}
    for shift in shifts:
        slot = (int(shift.date[8:10]), "night" if shift.shift_type == "night" else "day")
        start, end = schedule.shift_interval(shift)
        finished[slot] = end <= now
        standard[shift.user_id][slot] += _hours(start, end)
        fallback.setdefault(shift.user_id, shift.user_name)
        for user_id, user_name, part_start, part_end in schedule.work_parts(shift):
            worked[user_id][slot] += _hours(part_start, part_end)
            fallback.setdefault(user_id, user_name)

    rows: List[TimesheetRow] = []
    for user_id in sorted(set(worked) | set(standard)):
        worked_cells, standard_cells = [], []
        for slot in sorted(set(worked[user_id]) | set(standard[user_id]), key=lambda s: (s[0], s[1] == "night")):
            day, kind = slot
            fact, plan = worked[user_id].get(slot, 0.0), standard[user_id].get(slot, 0.0)
            if plan:
                standard_cells.append(TimesheetCell(day=day, kind=kind, hours=plan, status="plan"))
            if fact and abs(fact - plan) > 0.01:
                cell_status = "changed"
            elif fact:
                cell_status = "worked" if finished.get(slot) else "plan"
            else:
                cell_status = "missed"
            if fact or finished.get(slot):
                worked_cells.append(TimesheetCell(day=day, kind=kind, hours=fact, status=cell_status))
        rows.append(TimesheetRow(
            user_id=user_id,
            name=names.get(user_id) or fallback.get(user_id, f"#{user_id}"),
            worked=worked_cells,
            standard=standard_cells,
            worked_shifts=round(sum(c.hours for c in worked_cells) / 12, 2),
            standard_shifts=round(sum(c.hours for c in standard_cells) / 12, 2),
        ))

    return Timesheet(
        month=month_key(year, month),
        days=[TimesheetDay(day=d, weekday=WEEKDAYS[date(year, month, d).weekday()]) for d in range(1, days + 1)],
        rows=rows,
    )


# =============================================================================
# Выгрузка
# =============================================================================

_THIN = Side(style="thin")
_BORDER = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_THIN)
_FONT = Font(name="Calibri", size=12)
_BOLD = Font(name="Calibri", size=12, bold=True)
_CENTER = Alignment(horizontal="center", vertical="center")


def _fill(color: str) -> PatternFill:
    return PatternFill("solid", fgColor="FF" + color)


def _cell(ws, row: int, col: int, value=None, font=_FONT, border=True, align=None, fill=None):
    cell = ws.cell(row=row, column=col)
    if value is not None:
        if isinstance(value, str):
            cell.value = _clean(value)
            if cell.value.startswith("="):
                cell.data_type = "s"
        else:
            cell.value = value
    cell.font = font
    if border:
        cell.border = _BORDER
    if align:
        cell.alignment = align
    if fill:
        cell.fill = _fill(fill)
    return cell


def _day_col(day: int, kind: str) -> int:
    return FIRST_DAY_COL + (day - 1) * 2 + (1 if kind == "night" else 0)


def _write_block(ws, top: int, sheet: Timesheet, show_year: bool) -> int:
    """Блок месяца, начиная со строки top. Возвращает первую свободную строку после блока."""
    year, month = int(sheet.month[:4]), int(sheet.month[5:])
    days = len(sheet.days)
    last_col = FIRST_DAY_COL + days * 2 - 1
    if show_year:
        _cell(ws, top, LABEL_COL, year, border=False)
    _cell(ws, top, MONTH_TITLE_COL, MONTH_NAMES[month - 1], border=False)

    number_row, weekday_row, kind_row = top + 1, top + 2, top + 3
    _cell(ws, number_row, LABEL_COL, "число", align=_CENTER)
    _cell(ws, weekday_row, LABEL_COL, "день недели", align=_CENTER)
    _cell(ws, kind_row, LABEL_COL, "смена", align=_CENTER)
    for info in sheet.days:
        col = _day_col(info.day, "day")
        for row, value in ((number_row, info.day), (weekday_row, info.weekday)):
            _cell(ws, row, col, value, align=_CENTER)
            _cell(ws, row, col + 1)
            ws.merge_cells(start_row=row, start_column=col, end_row=row, end_column=col + 1)
        _cell(ws, kind_row, col, "д")
        _cell(ws, kind_row, col + 1, "н")
    _cell(ws, number_row, COUNT_COL, "кол-во смен", border=False)

    row = kind_row + 2
    for person in sheet.rows:
        for suffix, cells in ((WORKED_SUFFIX, person.worked), (STANDARD_SUFFIX, person.standard)):
            _cell(ws, row, LABEL_COL, f"{person.name} {suffix}", font=_BOLD, align=_CENTER)
            for col in range(FIRST_DAY_COL, last_col + 1):
                _cell(ws, row, col)
            for item in cells:
                fill = STATUS_FILLS.get(item.status) if suffix == WORKED_SUFFIX else None
                _cell(ws, row, _day_col(item.day, item.kind), _number(item.hours), fill=fill)
            total = ws.cell(row=row, column=COUNT_COL, value=f"=SUM(E{row}:BN{row})/12")
            total.font = _FONT
            total.number_format = "0.0"
            row += 1
        row += 1  # пустая строка между сотрудниками, как в файле
    return max(row, kind_row + 2) + 2


def _write_legend(ws, top: int) -> None:
    for offset, (color, label) in enumerate((
        (FILL_MISSED, "не отработано"),
        (FILL_CHANGED, "план"),
        (FILL_WORKED, "отработано"),
        (FILL_HOLIDAY, "праздник"),
    )):
        ws.cell(row=top + offset, column=1).fill = _fill(color)
        _cell(ws, top + offset, 2, label, border=False)


def export_workbook(db: Session, months: List[Tuple[int, int]]) -> bytes:
    workbook = Workbook()
    ws = workbook.active
    ws.title = "Общее"
    ws.sheet_view.zoomScale = 70
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions[get_column_letter(LABEL_COL)].width = 34
    for col in range(FIRST_DAY_COL, COUNT_COL):
        ws.column_dimensions[get_column_letter(col)].width = 3.4
    ws.column_dimensions[get_column_letter(COUNT_COL)].width = 12.4

    now = schedule.now_local()
    row = 1
    previous_year = None
    for index, (year, month) in enumerate(months):
        sheet = build_timesheet(db, year, month, now)
        if index == 0:
            _write_legend(ws, row + 5)
        row = _write_block(ws, row, sheet, show_year=year != previous_year)
        previous_year = year
    ws.freeze_panes = ws.cell(row=1, column=FIRST_DAY_COL)

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


# =============================================================================
# Загрузка
# =============================================================================

@dataclass
class _Block:
    year: int
    month: int
    label_col: int
    columns: Dict[int, Tuple[int, str]]  # колонка → (день, day/night)
    people: List[Tuple[int, str, List[object]]] = field(default_factory=list)  # (строка, подпись, ячейки)


@dataclass
class ParsedSchedule:
    sheet: str
    # (год, месяц) → (день, day/night) → [(user_id, часы)] в порядке строк файла
    slots: Dict[Tuple[int, int], Dict[Tuple[int, str], List[Tuple[int, float]]]]
    people: Dict[Tuple[int, int], List[str]]
    unknown: List[str]
    warnings: List[str]


def _text(value) -> str:
    return "" if value is None else " ".join(str(value).replace("\xa0", " ").split())


def _fill_color(cell) -> str:
    fill = getattr(cell, "fill", None)
    if not fill or fill.fill_type != "solid":
        return ""
    rgb = getattr(fill.fgColor, "rgb", None)
    return rgb[-6:].upper() if isinstance(rgb, str) else ""


def _as_hours(value) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = _text(value).replace(",", ".")
    try:
        return float(text) if text else None
    except ValueError:
        return None


def _find_month(rows: List[List[object]], index: int, label_col: int) -> Tuple[Optional[int], Optional[int]]:
    """Месяц и год в заголовке над строкой «число» (до 4 строк выше)."""
    found_month = found_year = None
    for back in range(1, 5):
        if index - back < 0:
            break
        for cell in rows[index - back]:
            value = getattr(cell, "value", None)
            if isinstance(value, (int, float)) and not isinstance(value, bool) and 2000 <= value <= 2100 and found_year is None:
                found_year = int(value)
            elif isinstance(value, str) and found_month is None and len(value) < 60:
                match = _MONTH_RE.search(value.lower())
                if match:
                    found_month = [m.lower() for m in MONTH_NAMES].index(match.group(1)) + 1
        if found_month:
            break
    return found_month, found_year


def _weekday_year(month: int, guess: int, weekdays: Dict[int, str]) -> int:
    """Год, в котором дни недели из файла совпадают с календарём (ближайший к ожидаемому)."""
    if not weekdays:
        return guess
    for delta in (0, 1, -1, 2, -2, 3, -3):
        year = guess + delta
        days = _days_in_month(year, month)
        if all(day <= days and WEEKDAYS[date(year, month, day).weekday()].lower() == name.lower()[:2]
               for day, name in weekdays.items()):
            return year
    return guess


def _read_blocks(sheet) -> Tuple[List[_Block], List[str]]:
    rows = []
    for values in sheet.iter_rows(max_col=MAX_SCAN_COLS):
        rows.append(list(values))
        if len(rows) > MAX_SCAN_ROWS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"В файле больше {MAX_SCAN_ROWS} строк")

    warnings: List[str] = []
    blocks: List[_Block] = []
    year_hint: Optional[int] = None
    previous_month: Optional[int] = None
    index = 0
    while index < len(rows):
        row = rows[index]
        label_col = next((i for i, c in enumerate(row[:8]) if _norm(_text(getattr(c, "value", None))) == "число"), None)
        if label_col is None:
            index += 1
            continue
        month, year = _find_month(rows, index, label_col)
        if not month:
            warnings.append(f"Строка {index + 1}: не нашли название месяца над строкой «число» — блок пропущен")
            index += 1
            continue
        if year is None:
            year = year_hint if year_hint is not None else schedule.now_local().year
            if previous_month and month < previous_month and year_hint is not None:
                year += 1

        # Номера дней стоят в колонке «д» (объединены с «н»); строка «смена» уточняет, где д, а где н
        day_at: Dict[int, int] = {}
        for i, cell in enumerate(row):
            value = getattr(cell, "value", None)
            if i > label_col and isinstance(value, (int, float)) and not isinstance(value, bool) and 1 <= value <= 31:
                day_at[i] = int(value)
        header = {_norm(_text(getattr(r[label_col], "value", None))): r for r in rows[index + 1:index + 4] if len(r) > label_col}
        kinds = header.get("смена")
        weekday_row = header.get("день недели")
        columns: Dict[int, Tuple[int, str]] = {}
        current_day = None
        for i in range(label_col + 1, len(row)):
            if i in day_at:
                current_day = day_at[i]
            if current_day is None:
                continue
            mark = _norm(_text(getattr(kinds[i], "value", None))) if kinds and i < len(kinds) else ""
            if mark in ("д", "н"):
                columns[i] = (current_day, "day" if mark == "д" else "night")
            elif not kinds and i in day_at:
                columns[i], columns[i + 1] = (current_day, "day"), (current_day, "night")
        weekdays = {}
        if weekday_row:
            for i, day in day_at.items():
                text = _text(getattr(weekday_row[i], "value", None)) if i < len(weekday_row) else ""
                if text:
                    weekdays[day] = text
        year = _weekday_year(month, year, weekdays)
        block = _Block(year=year, month=month, label_col=label_col, columns=columns)

        # Строки сотрудников — до следующего блока
        cursor = index + 1
        while cursor < len(rows):
            cells = rows[cursor]
            label = _text(getattr(cells[label_col], "value", None)) if len(cells) > label_col else ""
            normalized = _norm(label)
            if normalized == "число":
                break
            if normalized not in ("", "день недели", "смена") and not re.fullmatch(r"20\d\d", label):
                block.people.append((cursor + 1, label, cells))
            cursor += 1
        blocks.append(block)
        year_hint, previous_month = year, month
        index = cursor
    return blocks, warnings


def _name_tokens(name: str) -> set:
    return set(_norm(name).split())


def _match_user(users: List[User], label: str) -> Tuple[Optional[User], bool]:
    """Сотрудник по имени из файла: «Имя Фамилия», «Фамилия Имя» или только фамилия/имя, если он один такой."""
    tokens = _name_tokens(label)
    if not tokens:
        return None, False
    exact = [u for u in users if _name_tokens(u.name) == tokens]
    if len(exact) == 1:
        return exact[0], False
    loose = [u for u in users if tokens <= _name_tokens(u.name) or (_name_tokens(u.name) and _name_tokens(u.name) <= tokens)]
    if len(loose) == 1:
        return loose[0], False
    return None, len(loose) > 1


def _split_label(label: str) -> Tuple[str, str]:
    """«Иван Петров отработано» → («Иван Петров», "worked")."""
    lowered = label.lower()
    for suffix, kind in ((WORKED_SUFFIX, "worked"), (STANDARD_SUFFIX, "standard"), ("станд. график", "standard")):
        if lowered.endswith(suffix):
            return label[: -len(suffix)].strip(), kind
    return label.strip(), "plain"


def parse_schedule(db: Session, content: bytes) -> ParsedSchedule:
    workbook = open_workbook(content)
    names = {_norm(n): n for n in workbook.sheetnames}
    sheet_name = next((names[k] for k in ("общее", "график") if k in names), workbook.sheetnames[0])
    blocks, warnings = _read_blocks(workbook[sheet_name])
    if not blocks:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Не нашли в файле ни одного месяца: нужна строка «число» с датами")

    users = db.query(User).order_by(User.id).all()
    slots: Dict[Tuple[int, int], Dict[Tuple[int, str], List[Tuple[int, float]]]] = {}
    people: Dict[Tuple[int, int], List[str]] = {}
    unknown: Dict[str, None] = {}
    nameless = 0
    for block in blocks:
        key = (block.year, block.month)
        if key in slots:
            warnings.append(f"{MONTH_NAMES[block.month - 1]} {block.year} встречается в файле дважды — взят первый блок")
            continue
        days = _days_in_month(block.year, block.month)
        # Для каждого сотрудника берём строку «отработано»; «станд.график» — только если факта нет
        by_user: Dict[int, Dict[str, List[object]]] = defaultdict(dict)
        order: List[int] = []
        for row_number, label, cells in block.people:
            name, kind = _split_label(label)
            if not re.search(r"[A-Za-zА-Яа-яЁё]", name):
                nameless += 1
                continue
            user, ambiguous = _match_user(users, name)
            if not user:
                unknown.setdefault(f"{name} (несколько похожих сотрудников)" if ambiguous else name, None)
                continue
            if user.id not in by_user:
                order.append(user.id)
            by_user[user.id].setdefault(kind, cells)

        month_slots: Dict[Tuple[int, str], List[Tuple[int, float]]] = defaultdict(list)
        for user_id in order:
            rows_by_kind = by_user[user_id]
            cells = rows_by_kind.get("worked") or rows_by_kind.get("plain") or rows_by_kind.get("standard")
            for col, (day, kind) in block.columns.items():
                if day > days or col >= len(cells):
                    continue
                cell = cells[col]
                hours = _as_hours(getattr(cell, "value", None))
                if not hours or hours <= 0 or _fill_color(cell) == FILL_MISSED:
                    continue
                month_slots[(day, kind)].append((user_id, min(hours, 24.0)))
        slots[key] = dict(month_slots)
        people[key] = [next(u.name for u in users if u.id == uid) for uid in order]

    if nameless:
        warnings.append(f"Строк без имени сотрудника: {nameless} — пропущены")
    return ParsedSchedule(sheet=sheet_name, slots=slots, people=people, unknown=list(unknown), warnings=warnings)


# --- Сравнение с графиком на сайте и запись ---------------------------------------

def _preset(kind: str) -> Tuple[str, str]:
    return schedule.DAY_PRESET if kind == "day" else schedule.NIGHT_PRESET


def _plan_parts(start: datetime, end: datetime, entries: List[Tuple[int, float]], keep_order: List[int]) -> List[Tuple[int, datetime]]:
    """Части смены: (сотрудник, с какого времени). Часы из файла пропорционально укладываем в длину смены,
    шаг — 5 минут. Порядок — как сейчас на сайте, новые сотрудники — по порядку строк файла."""
    rank = {uid: i for i, uid in enumerate(keep_order)}
    ordered = sorted(entries, key=lambda item: rank.get(item[0], len(rank)))[:6]
    if len(ordered) == 1:
        return [(ordered[0][0], start)]
    total_minutes = int((end - start).total_seconds() // 60)
    total_hours = sum(h for _, h in ordered)
    parts, moment, used = [], start, 0
    for index, (user_id, hours) in enumerate(ordered):
        parts.append((user_id, moment))
        if index == len(ordered) - 1:
            break
        minutes = max(STEP_MINUTES, round(hours / total_hours * total_minutes / STEP_MINUTES) * STEP_MINUTES)
        minutes = min(minutes, total_minutes - used - STEP_MINUTES * (len(ordered) - index - 1))
        used += minutes
        moment = start + timedelta(minutes=used)
    return parts


def _groups(entries: List[Tuple[int, float]], length: float) -> List[List[Tuple[int, float]]]:
    """
    Кто в этой ячейке-смене работал вместе, а кто — по очереди.
    Полная смена (12 ч) — отдельная смена сотрудника: двое по 12 — значит, оба на смене одновременно.
    Неполные часы (4/4/4 ночью) — части одной смены, пока их сумма укладывается в длину смены.
    """
    merged: Dict[int, float] = {}
    for user_id, hours in entries:
        merged[user_id] = merged.get(user_id, 0.0) + hours
    groups: List[List[Tuple[int, float]]] = [[(uid, h)] for uid, h in merged.items() if h >= length - 0.01]
    current: List[Tuple[int, float]] = []
    for uid, hours in merged.items():
        if hours >= length - 0.01:
            continue
        if current and sum(h for _, h in current) + hours > length + 0.01:
            groups.append(current)
            current = []
        current.append((uid, hours))
    if current:
        groups.append(current)
    return groups


def _participants(shift: Shift) -> List[int]:
    return [uid for uid, *_ in schedule.work_parts(shift)]


def _signature(shift: Shift) -> Tuple:
    parts = sorted((uid, round((e - s).total_seconds() / 60)) for uid, _, s, e in schedule.work_parts(shift))
    return shift.start_time, shift.end_time, parts


def _planned_signature(start_time: str, end_time: str, end: datetime, parts: List[Tuple[int, datetime]]) -> Tuple:
    bounds = [moment for _, moment in parts] + [end]
    return start_time, end_time, sorted(
        (uid, round((bounds[i + 1] - bounds[i]).total_seconds() / 60)) for i, (uid, _) in enumerate(parts)
    )


@dataclass
class _Change:
    status: str  # new / changed / same
    shift: Optional[Shift]
    day: str
    kind: str
    start_time: str
    end_time: str
    parts: List[Tuple[int, datetime]]


def _match_groups(groups: List[List[Tuple[int, float]]], existing: List[Shift]) -> List[Optional[Shift]]:
    """Какой смене на сайте соответствует каждая группа из файла: сначала по общим сотрудникам, потом по порядку."""
    matched: List[Optional[Shift]] = [None] * len(groups)
    used: set = set()
    for index, group in enumerate(groups):
        people = {uid for uid, _ in group}
        candidates = [s for s in existing if s.id not in used and people & set(_participants(s))]
        if candidates:
            best = next((s for s in candidates if s.user_id == group[0][0]), candidates[0])
            matched[index] = best
            used.add(best.id)
    leftovers = [s for s in existing if s.id not in used]
    for index, shift in enumerate(matched):
        if shift is None and leftovers:
            matched[index] = leftovers.pop(0)
    return matched


def _diff(db: Session, parsed: ParsedSchedule, months: Optional[Iterable[str]]) -> Dict[Tuple[int, int], List[_Change]]:
    wanted = set(months) if months is not None else None
    result: Dict[Tuple[int, int], List[_Change]] = {}
    for (year, month), month_slots in parsed.slots.items():
        if wanted is not None and month_key(year, month) not in wanted:
            continue
        prefix = month_key(year, month)
        existing: Dict[Tuple[str, str], List[Shift]] = defaultdict(list)
        for shift in (
            db.query(Shift).options(selectinload(Shift.segments))
            .filter(Shift.date >= f"{prefix}-01", Shift.date <= f"{prefix}-31").order_by(Shift.id).all()
        ):
            existing[(shift.date, "night" if shift.shift_type == "night" else "day")].append(shift)
        changes = []
        for (day, kind), entries in sorted(month_slots.items(), key=lambda item: (item[0][0], item[0][1] == "night")):
            day_key = f"{prefix}-{day:02d}"
            preset_start, preset_end = _preset(kind)
            groups = _groups(entries, 12.0)
            for group, shift in zip(groups, _match_groups(groups, existing.get((day_key, kind), []))):
                start_time = shift.start_time if shift else preset_start
                start = datetime.fromisoformat(f"{day_key}T{start_time}")
                end_time = preset_end
                if shift and len(group) > 1:
                    end_time = shift.end_time
                elif len(group) == 1 and group[0][1] < 12.0 - 0.01:
                    # Неполная смена одного человека (например, 8 ч днём) — короче стандартной
                    end_time = (start + timedelta(minutes=round(group[0][1] * 60))).strftime("%H:%M")
                elif shift and len(group) == 1:
                    end_time = shift.end_time
                end = datetime.fromisoformat(f"{day_key}T{end_time}")
                if end <= start:
                    end += timedelta(days=1)
                parts = _plan_parts(start, end, group, _participants(shift) if shift else [])
                if not shift:
                    state = "new"
                elif _signature(shift) == _planned_signature(start_time, end_time, end, parts):
                    state = "same"
                else:
                    state = "changed"
                changes.append(_Change(state, shift, day_key, kind, start_time, end_time, parts))
        result[(year, month)] = changes
    return result


def preview(db: Session, content: bytes) -> ScheduleImportPreview:
    parsed = parse_schedule(db, content)
    diff = _diff(db, parsed, None)
    months = []
    for (year, month), changes in sorted(diff.items()):
        months.append(ScheduleImportMonth(
            month=month_key(year, month),
            label=f"{MONTH_NAMES[month - 1]} {year}",
            new=sum(c.status == "new" for c in changes),
            changed=sum(c.status == "changed" for c in changes),
            same=sum(c.status == "same" for c in changes),
            people=parsed.people.get((year, month), []),
        ))
    return ScheduleImportPreview(sheet=parsed.sheet, months=months, unknown_people=parsed.unknown, warnings=parsed.warnings)


def apply_import(db: Session, content: bytes, months: Optional[List[str]], mode: str) -> ScheduleImportResult:
    """
    mode=update — смены из файла создаются, а отличающиеся меняются под файл;
    mode=fill — только новые смены. Смены, которых нет в файле, не трогаем.
    """
    parsed = parse_schedule(db, content)
    diff = _diff(db, parsed, months)
    users = {u.id: u for u in db.query(User).all()}
    created = updated = unchanged = skipped = 0
    for changes in diff.values():
        for change in changes:
            if change.status == "same":
                unchanged += 1
                continue
            if change.status == "changed" and mode == "fill":
                skipped += 1
                continue
            first = users[change.parts[0][0]]
            shift = change.shift
            if shift is None:
                shift = Shift(date=change.day, shift_type=change.kind, user_id=first.id, user_name=first.name, position=first.position)
                db.add(shift)
                created += 1
            else:
                updated += 1
            shift.start_time, shift.end_time = change.start_time, change.end_time
            db.flush()
            parts = [ShiftPart(user_id=uid, start_at=moment.strftime("%Y-%m-%dT%H:%M")) for uid, moment in change.parts]
            schedule.apply_split(db, shift, parts)
    db.commit()
    return ScheduleImportResult(created=created, updated=updated, unchanged=unchanged, skipped=skipped, warnings=parsed.warnings)
