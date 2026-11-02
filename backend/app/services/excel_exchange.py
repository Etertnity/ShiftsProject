"""Обмен с Excel: выгрузка передач и кейсов и загрузка журнала передач обратно.

Формат листа «Передачи» повторяет журнал, который смены вели в Excel вручную:

    Дата                     | Фамилия сменного | <категория 1> | <категория 2> | … | Разное
    17.10.2026 21:00 -       | Петров           | 1) Continue CASE#100 Alpha - замена модема…
    18.10.2026 09:00         |                  | 2) Open CASE#101 Beta - выход из сети…

Каждая строка — одна передача смены. В ячейке категории — нумерованный список кейсов:
«N) <действие> <название> - <что сделано>», где действие — Open / Continue / Close / Open-Close.
Выгруженный файл можно отредактировать и загрузить обратно: передачи не задвоятся, кейсы найдутся по номеру CASE#.
"""
import bisect
import io
import json
import re
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from openpyxl import Workbook, load_workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Asset,
    AssetCategory,
    AssetEntry,
    AssetStatusOption,
    HandoverAsset,
    Shift,
    ShiftHandover,
    User,
)
from app.services import catalog
from app.services.schedule import shift_interval

# --- Ограничения на загружаемый файл: защита от «zip-бомб» и слишком тяжёлых файлов ---
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_UNPACKED_BYTES = 60 * 1024 * 1024
MAX_ROWS = 3000
MAX_COLUMNS = 40
MAX_ITEMS_PER_CELL = 300
MAX_CELL_CHARS = 60_000

NOTES_COLUMN_TITLE = "Разное"
ID_COLUMN_TITLE = "№ на сайте"
DATE_COLUMN_TITLE = "Дата"
PERSON_COLUMN_TITLE = "Фамилия сменного"
IMPORT_NOTE = "Импортировано из Excel"

ACTION_LABELS = {"open": "Open", "continue": "Continue", "close": "Close", "open-close": "Open-Close"}
KIND_LABELS = {"created": "Создан", "comment": "Запись", "status": "Смена статуса", "edit": "Правка"}

_DATETIME_RE = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T]+(\d{1,2})[:.](\d{2}))?")
_ITEM_START_RE = re.compile(r"^\s*(\d{1,3})\s*[).]\s*")
_ACTION_RE = re.compile(r"^(open\s*[-–]?\s*close|open|close|continue|cotninue|contunue|contiune)\b[.:]?\s*", re.I)
_CASE_RE = re.compile(r"CASE\s*#\s*(\d+)", re.I)
_SEPARATOR_RE = re.compile(r"\s+[-–—]\s+|\s+[-–—](?=\S)")


# =============================================================================
# Общие помощники
# =============================================================================

def _tz() -> ZoneInfo:
    return ZoneInfo(settings.timezone)


def _local(dt_utc: datetime) -> datetime:
    """Naive UTC из БД → местное время смен."""
    return dt_utc.replace(tzinfo=timezone.utc).astimezone(_tz()).replace(tzinfo=None)


def _to_utc(local_dt: datetime) -> datetime:
    return local_dt.replace(tzinfo=_tz()).astimezone(timezone.utc).replace(tzinfo=None)


def _fmt(dt: datetime) -> str:
    return dt.strftime("%d.%m.%Y %H:%M")


def _clean(value: Optional[str]) -> str:
    """Текст для ячейки: без управляющих символов, которые ломают xlsx."""
    return ILLEGAL_CHARACTERS_RE.sub("", value or "")


def _set_text(cell, value: Optional[str]) -> None:
    """Пишет строку как текст. Строка, начинающаяся с «=», иначе стала бы формулой (formula injection)."""
    cell.value = _clean(value)
    if isinstance(cell.value, str) and cell.value.startswith("="):
        cell.data_type = "s"


def _one_line(text: Optional[str]) -> str:
    return " ".join((text or "").split())


def _norm(text: str) -> str:
    return " ".join(text.lower().replace("ё", "е").split())


# =============================================================================
# 2 волна (дневные «2 через 2») в Excel-журнал передач не входит
# =============================================================================

SECOND_WAVE_SKIPPED = "2 волна — в журнал Excel не входит"


def _second_wave_ids(db: Session) -> set:
    return {uid for (uid,) in db.query(User.id).filter(User.wave == 2).all()}


def _hidden_entry(entry: AssetEntry, second_wave: set, second_wave_handovers: set) -> bool:
    """Запись 2 волны: её автор из 2 волны или она сделана в передаче 2 волны."""
    return entry.author_id in second_wave or (entry.handover_id is not None and entry.handover_id in second_wave_handovers)


# =============================================================================
# Выгрузка
# =============================================================================

@dataclass
class _ExportContext:
    categories: List[AssetCategory]
    category_names: Dict[str, str]
    status_names: Dict[str, str]
    closed_statuses: set


def _context(db: Session) -> _ExportContext:
    categories = db.query(AssetCategory).order_by(AssetCategory.position, AssetCategory.id).all()
    statuses = db.query(AssetStatusOption).all()
    return _ExportContext(
        categories=categories,
        category_names={c.key: c.name for c in categories},
        status_names={s.key: s.name for s in statuses},
        closed_statuses={s.key for s in statuses if s.is_closed},
    )


def _action(entries: List[AssetEntry], closed: set) -> str:
    """Что произошло с кейсом в этой передаче: создан и/или закрыт, иначе — продолжение."""
    created = any(e.kind == "created" for e in entries)
    closed_now = any(e.new_status in closed for e in entries if e.new_status)
    if created and closed_now:
        return "open-close"
    if created:
        return "open"
    if closed_now:
        return "close"
    return "continue"


def _style_header(ws, widths: List[int]) -> None:
    for index, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(index)].width = width
        cell = ws.cell(row=1, column=index)
        cell.font = Font(bold=True)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        cell.fill = PatternFill("solid", fgColor="EEF2F7")
    ws.freeze_panes = "A2"


def _handover_period(handover: ShiftHandover, shift: Optional[Shift]) -> Tuple[str, str]:
    """(период, фамилия/имя сменного)."""
    if shift:
        start, end = shift_interval(shift)
        names = [s.user_name for s in shift.segments] if shift.segments else [shift.user_name]
        return f"{_fmt(start)} -\n{_fmt(end)}", " / ".join(dict.fromkeys(names))
    # Передача из Excel без привязки к смене: начало смены сохранено в source_key
    match = re.match(r"^xlsx:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})", handover.source_key or "")
    if match:
        return f"{_fmt(datetime.fromisoformat(match.group(1)))} -\n{_fmt(_local(handover.created_at))}", ""
    return _fmt(_local(handover.created_at)), ""


def export_workbook(db: Session, date_from: Optional[date], date_to: Optional[date]) -> bytes:
    ctx = _context(db)
    wb = Workbook()

    # Границы периода в UTC (передачи и записи хранятся в UTC)
    start_utc = _to_utc(datetime.combine(date_from, time.min)) if date_from else None
    end_utc = _to_utc(datetime.combine(date_to + timedelta(days=1), time.min)) if date_to else None

    def in_range(query, column):
        if start_utc:
            query = query.filter(column >= start_utc)
        if end_utc:
            query = query.filter(column < end_utc)
        return query

    # --- Лист «Передачи» в формате ручного журнала ---
    ws = wb.active
    ws.title = "Передачи"
    headers = [DATE_COLUMN_TITLE, PERSON_COLUMN_TITLE]
    headers += [f"{c.name}\n{c.description}" if c.description else c.name for c in ctx.categories]
    headers.append(NOTES_COLUMN_TITLE)
    # Номер передачи на сайте: при обратной загрузке этого же файла строки не задвоятся
    headers.append(ID_COLUMN_TITLE)
    for index, title in enumerate(headers, start=1):
        _set_text(ws.cell(row=1, column=index), title)
    _style_header(ws, [20, 20] + [70] * len(ctx.categories) + [55, 10])

    # Журнал Excel — только 1 волна: передачи и записи 2 волны (дневные «2 через 2») в файл не попадают
    second_wave = _second_wave_ids(db)
    second_wave_handovers = {h for (h,) in db.query(ShiftHandover.id).filter(ShiftHandover.wave == 2).all()}
    handovers = in_range(db.query(ShiftHandover).filter(ShiftHandover.wave != 2), ShiftHandover.created_at).order_by(
        ShiftHandover.created_at, ShiftHandover.id
    ).all()
    ids = [h.id for h in handovers]
    shift_ids = {h.from_shift_id for h in handovers if h.from_shift_id}
    shifts = {s.id: s for s in db.query(Shift).filter(Shift.id.in_(shift_ids)).all()} if shift_ids else {}
    links: Dict[int, List[int]] = defaultdict(list)
    for link in db.query(HandoverAsset).filter(HandoverAsset.handover_id.in_(ids)).order_by(HandoverAsset.id).all() if ids else []:
        links[link.handover_id].append(link.asset_id)
    asset_ids = {a for lst in links.values() for a in lst}
    assets = {a.id: a for a in db.query(Asset).filter(Asset.id.in_(asset_ids)).all()} if asset_ids else {}
    entries_by: Dict[Tuple[int, int], List[AssetEntry]] = defaultdict(list)
    if ids:
        for entry in db.query(AssetEntry).filter(AssetEntry.handover_id.in_(ids)).order_by(AssetEntry.id).all():
            if not _hidden_entry(entry, second_wave, second_wave_handovers):
                entries_by[(entry.handover_id, entry.asset_id)].append(entry)
    # Тексты истории по кейсам: если в смене записи не было, в журнал идёт последний известный текст
    texts_by_asset: Dict[int, List[Tuple[datetime, str]]] = defaultdict(list)
    statuses_by_asset: Dict[int, List[Tuple[datetime, str]]] = defaultdict(list)
    if asset_ids:
        for entry in (db.query(AssetEntry)
                      .filter(AssetEntry.asset_id.in_(asset_ids))
                      .order_by(AssetEntry.created_at, AssetEntry.id).all()):
            if entry.text and not _hidden_entry(entry, second_wave, second_wave_handovers):
                texts_by_asset[entry.asset_id].append((entry.created_at, entry.text))
            if entry.new_status:
                statuses_by_asset[entry.asset_id].append((entry.created_at, entry.new_status))

    def _at(history: List[Tuple[datetime, str]], moment: datetime) -> Optional[str]:
        position = bisect.bisect_right([at for at, _ in history], moment)
        return history[position - 1][1] if position else None

    def latest_text(asset: Asset, moment: datetime) -> str:
        return _one_line(_at(texts_by_asset.get(asset.id, []), moment) or asset.description)

    def closed_at(asset: Asset, moment: datetime) -> bool:
        """Был ли кейс закрыт на момент передачи — тогда в журнале он «Close», а не «Continue»."""
        return (_at(statuses_by_asset.get(asset.id, []), moment) or asset.status) in ctx.closed_statuses

    for row, handover in enumerate(handovers, start=2):
        period, person = _handover_period(handover, shifts.get(handover.from_shift_id))
        if not person:
            authors = [e.author_name for (h, _), lst in entries_by.items() if h == handover.id for e in lst if e.author_name]
            person = authors[0] if authors else ""
        _set_text(ws.cell(row=row, column=1), period)
        _set_text(ws.cell(row=row, column=2), person)
        for col, category in enumerate(ctx.categories, start=3):
            lines = []
            for asset_id in links.get(handover.id, []):
                asset = assets.get(asset_id)
                if not asset or asset.asset_type != category.key:
                    continue
                entries = entries_by.get((handover.id, asset.id), [])
                texts = [_one_line(e.text) for e in entries if e.text]
                text = "; ".join(texts) or latest_text(asset, handover.created_at)
                kind = _action(entries, ctx.closed_statuses)
                if kind == "continue" and closed_at(asset, handover.created_at):
                    kind = "close"
                action = ACTION_LABELS[kind]
                lines.append(f"{len(lines) + 1}) {action} {_one_line(asset.title)} - {text}")
            _set_text(ws.cell(row=row, column=col), "\n".join(lines))
        notes = handover.handover_notes if handover.handover_notes != IMPORT_NOTE else ""
        _set_text(ws.cell(row=row, column=len(headers) - 1), notes)
        ws.cell(row=row, column=len(headers)).value = handover.id
        for col in range(1, len(headers) + 1):
            ws.cell(row=row, column=col).alignment = Alignment(wrap_text=True, vertical="top")

    # --- Лист «Кейсы» ---
    ws = wb.create_sheet("Кейсы")
    case_headers = ["ID", "Категория", "Название", "Описание", "Статус", "Закрыт", "Создан", "Обновлён",
                    "Последняя запись", "Автор записи", "Доп. поля"]
    for index, title in enumerate(case_headers, start=1):
        _set_text(ws.cell(row=1, column=index), title)
    _style_header(ws, [7, 18, 40, 60, 16, 9, 17, 17, 60, 20, 40])

    all_assets = db.query(Asset).order_by(Asset.asset_type, Asset.updated_at.desc()).all()
    last_entries: Dict[int, AssetEntry] = {}
    for entry in db.query(AssetEntry).filter(AssetEntry.text.isnot(None)).order_by(AssetEntry.id).all():
        if not _hidden_entry(entry, second_wave, second_wave_handovers):
            last_entries[entry.asset_id] = entry
    fields_by_category = {c.key: {f.key: f.label for f in c.fields} for c in ctx.categories}
    for row, asset in enumerate(all_assets, start=2):
        last = last_entries.get(asset.id)
        labels = fields_by_category.get(asset.asset_type, {})
        custom = catalog.load_custom_fields(asset)
        custom_text = "; ".join(f"{labels.get(k, k)}: {v}" for k, v in custom.items() if v not in (None, "", False))
        values = [
            str(asset.id),
            ctx.category_names.get(asset.asset_type, asset.asset_type),
            asset.title,
            asset.description,
            ctx.status_names.get(asset.status, asset.status),
            "да" if asset.status in ctx.closed_statuses else "",
            _fmt(_local(asset.created_at)) if asset.created_at else "",
            _fmt(_local(asset.updated_at)) if asset.updated_at else "",
            last.text if last else "",
            (last.author_name or "") if last else "",
            custom_text,
        ]
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col)
            _set_text(cell, value)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws.auto_filter.ref = f"A1:{get_column_letter(len(case_headers))}{max(1, len(all_assets) + 1)}"

    # --- Лист «История» ---
    ws = wb.create_sheet("История")
    history_headers = ["Когда", "ID кейса", "Кейс", "Категория", "Событие", "Было", "Стало", "Текст", "Автор", "Передача"]
    for index, title in enumerate(history_headers, start=1):
        _set_text(ws.cell(row=1, column=index), title)
    _style_header(ws, [17, 9, 40, 18, 15, 15, 15, 70, 20, 10])
    all_by_id = {a.id: a for a in all_assets}
    history = [
        entry
        for entry in in_range(db.query(AssetEntry), AssetEntry.created_at).order_by(AssetEntry.created_at, AssetEntry.id).all()
        if not _hidden_entry(entry, second_wave, second_wave_handovers)
    ]
    for row, entry in enumerate(history, start=2):
        asset = all_by_id.get(entry.asset_id)
        values = [
            _fmt(_local(entry.created_at)) if entry.created_at else "",
            str(entry.asset_id),
            asset.title if asset else "",
            ctx.category_names.get(asset.asset_type, asset.asset_type) if asset else "",
            KIND_LABELS.get(entry.kind, entry.kind),
            ctx.status_names.get(entry.old_status, entry.old_status or ""),
            ctx.status_names.get(entry.new_status, entry.new_status or ""),
            entry.text or "",
            entry.author_name or "",
            str(entry.handover_id) if entry.handover_id else "",
        ]
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col)
            _set_text(cell, value)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws.auto_filter.ref = f"A1:{get_column_letter(len(history_headers))}{max(1, len(history) + 1)}"

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# =============================================================================
# Загрузка
# =============================================================================

@dataclass
class ParsedItem:
    action: str          # open | continue | close | open-close
    title: str
    description: str
    case_id: Optional[str]  # «CASE#392410», если номер есть
    body: str = ""          # текст пункта без номера и действия — для поиска кейса по названию


@dataclass
class ParsedRow:
    row: int
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    person: str = ""
    handover_id: Optional[int] = None  # из колонки «№ на сайте»: строка выгружена с этого сайта
    items: Dict[str, List[ParsedItem]] = field(default_factory=dict)  # ключ категории → кейсы
    notes: str = ""
    error: Optional[str] = None

    @property
    def source_key(self) -> str:
        return f"xlsx:{self.start:%Y-%m-%dT%H:%M}:{_norm(self.person)}" if self.start else ""


def read_upload(content: bytes):
    """Открывает xlsx с проверками размера; возвращает лист журнала передач."""
    workbook = open_workbook(content)
    return workbook["Передачи"] if "Передачи" in workbook.sheetnames else workbook.worksheets[0]


def open_workbook(content: bytes):
    """Открывает загруженный xlsx только для чтения, с проверками размера до и после распаковки."""
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Файл пустой")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Файл больше 5 МБ")
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            unpacked = sum(info.file_size for info in archive.infolist())
    except zipfile.BadZipFile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Это не файл Excel (.xlsx)")
    if unpacked > MAX_UNPACKED_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Файл слишком большой после распаковки")
    try:
        # read_only — потоковое чтение; XML разбирается через defusedxml (защита от XXE и «бомб»)
        return load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:  # noqa: BLE001 — openpyxl бросает самые разные исключения на битых файлах
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Не удалось прочитать файл Excel")


def _cell_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return _fmt(value)
    text = str(value).replace("\xa0", " ").replace("\r\n", "\n").replace("\r", "\n")
    return text[:MAX_CELL_CHARS]


def sheet_rows(sheet) -> Tuple[List[str], List[Tuple[int, List[object]]]]:
    """Заголовки и строки данных (номер строки в Excel, значения)."""
    rows = []
    headers: Optional[List[str]] = None
    for index, values in enumerate(sheet.iter_rows(values_only=True, max_col=MAX_COLUMNS), start=1):
        values = list(values)
        if headers is None:
            if sum(1 for v in values if v not in (None, "")) >= 2:
                headers = [_cell_text(v).strip() for v in values]
            continue
        if not any(v not in (None, "") for v in values):
            continue
        rows.append((index, values))
        if len(rows) > MAX_ROWS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"В файле больше {MAX_ROWS} строк")
    if headers is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Не нашли строку заголовков")
    return headers, rows


def guess_mapping(headers: List[str], categories: List[AssetCategory]) -> Dict[int, str]:
    """Сопоставление колонок: date / person / notes / category:<KEY> / skip."""
    mapping: Dict[int, str] = {}
    for index, header in enumerate(headers):
        text = _norm(header)
        if not text:
            continue
        if text in (_norm(ID_COLUMN_TITLE), "id", "№"):
            mapping[index] = "id"
            continue
        if "дата" in text or text.startswith("период") or text.startswith("смена"):
            mapping[index] = "date" if "date" not in mapping.values() else "skip"
            continue
        if "фамил" in text or "сменн" in text or "дежурн" in text or text.startswith("сотрудник"):
            mapping[index] = "person" if "person" not in mapping.values() else "skip"
            continue
        words = set(re.findall(r"[\w#]+", text))
        best, best_score = None, 0.0
        for category in categories:
            name = _norm(category.name)
            name_words = re.findall(r"[\w#]+", name)
            if not name_words:
                continue
            score = sum(1 for w in name_words if w in words) + (0.5 if name in text else 0)
            if _norm(category.key) in text.replace(" ", "_"):
                score += 0.25
            if score > best_score:
                best, best_score = category, score
        if best is not None and best_score >= 1:
            mapping[index] = f"category:{best.key}"
        elif text.startswith("разное") or "заметк" in text or "примечан" in text or "мониторинг" in text:
            mapping[index] = "notes"
        else:
            mapping[index] = "skip"
    return mapping


def parse_period(value) -> Tuple[Optional[datetime], Optional[datetime]]:
    if isinstance(value, datetime):
        return value, value + timedelta(hours=12)
    found = []
    for d, m, y, hh, mm in _DATETIME_RE.findall(_cell_text(value)):
        try:
            found.append(datetime(int(y), int(m), int(d), int(hh or 0), int(mm or 0)))
        except ValueError:
            return None, None
    if not found:
        return None, None
    start = found[0]
    end = found[1] if len(found) > 1 and found[1] > start else start + timedelta(hours=12)
    return start, end


def split_items(text: str) -> List[str]:
    """«1) …\\n2) …» → пункты. Строки без номера — продолжение предыдущего пункта."""
    items: List[str] = []
    for line in text.split("\n"):
        if not line.strip():
            continue
        if _ITEM_START_RE.match(line) or not items:
            items.append(_ITEM_START_RE.sub("", line, count=1).strip())
        else:
            items[-1] = f"{items[-1]} {line.strip()}"
    return [i for i in items if i][:MAX_ITEMS_PER_CELL]


def parse_item(text: str) -> ParsedItem:
    action = "continue"
    match = _ACTION_RE.match(text)
    if match:
        word = re.sub(r"\s|[-–]", "", match.group(1).lower())
        action = {"openclose": "open-close", "open": "open", "close": "close"}.get(word, "continue")
        text = text[match.end():]
    text = text.strip()

    parts = _SEPARATOR_RE.split(text, maxsplit=1)
    head = parts[0].strip()
    description = parts[1].strip() if len(parts) > 1 else ""

    case = _CASE_RE.search(head) or _CASE_RE.search(text)
    case_id = f"CASE#{case.group(1)}" if case else None
    if case_id:
        name = _CASE_RE.sub("", head)
        name = re.sub(r"^\s*CASE\b", "", name, flags=re.I)
        name = name.strip(" .,:;-–—")
        if not description and name:
            # «CASE#392632. Перегрев блока ASA» — без « - »: всё после номера и есть суть
            description = name
        title = f"{case_id} {name}".strip() if name else case_id
    else:
        title = head
    title = _one_line(title)[:300] or "Без названия"
    return ParsedItem(
        action=action,
        title=title,
        description=_one_line(description or text)[:20000],
        case_id=case_id,
        body=_one_line(text),
    )


def parse_rows(headers: List[str], rows, mapping: Dict[int, str]) -> List[ParsedRow]:
    date_cols = [i for i, v in mapping.items() if v == "date"]
    person_cols = [i for i, v in mapping.items() if v == "person"]
    if not date_cols:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Укажите колонку с датой смены")
    parsed: List[ParsedRow] = []
    for number, values in rows:
        row = ParsedRow(row=number)
        cell = lambda i: values[i] if i < len(values) else None  # noqa: E731
        row.start, row.end = parse_period(cell(date_cols[0]))
        if not row.start:
            row.error = "Не удалось разобрать дату смены"
            parsed.append(row)
            continue
        row.person = _cell_text(cell(person_cols[0])).strip()[:150] if person_cols else ""
        for id_col in (i for i, v in mapping.items() if v == "id"):
            raw_id = _cell_text(cell(id_col)).strip().removesuffix(".0")
            row.handover_id = int(raw_id) if raw_id.isdigit() else None
        notes = []
        for index, target in mapping.items():
            text = _cell_text(cell(index)).strip()
            if not text:
                continue
            if target == "notes":
                notes.append(text)
            elif target.startswith("category:"):
                key = target.split(":", 1)[1]
                row.items.setdefault(key, []).extend(parse_item(t) for t in split_items(text))
        row.notes = "\n\n".join(notes)[:20000]
        parsed.append(row)
    parsed.sort(key=lambda r: (r.start or datetime.max, r.row))
    return parsed


def _validate_mapping(raw: Optional[str], headers: List[str], categories: List[AssetCategory]) -> Dict[int, str]:
    if not raw:
        return guess_mapping(headers, categories)
    try:
        data = json.loads(raw)
        mapping = {int(k): str(v) for k, v in data.items()}
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Некорректное сопоставление колонок")
    keys = {c.key for c in categories}
    for index, target in mapping.items():
        if index < 0 or index >= len(headers):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Колонки с таким номером нет")
        if target in ("date", "person", "notes", "skip", "id"):
            continue
        if not (target.startswith("category:") and target.split(":", 1)[1] in keys):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Неизвестная категория: {target}")
    if list(mapping.values()).count("date") != 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нужна ровно одна колонка с датой")
    if list(mapping.values()).count("person") > 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Колонка с сотрудником должна быть одна")
    return mapping


def _existing_keys(db: Session, keys: Iterable[str]) -> set:
    keys = [k for k in keys if k]
    if not keys:
        return set()
    return {k for (k,) in db.query(ShiftHandover.source_key).filter(ShiftHandover.source_key.in_(keys)).all()}


def _existing_ids(db: Session, rows: List[ParsedRow]) -> set:
    ids = [r.handover_id for r in rows if r.handover_id]
    if not ids:
        return set()
    return {i for (i,) in db.query(ShiftHandover.id).filter(ShiftHandover.id.in_(ids)).all()}


def _is_duplicate(row: ParsedRow, keys: set, ids: set) -> bool:
    """Строка уже на сайте: загружена раньше (та же смена и сотрудник) или выгружена отсюда (есть «№ на сайте»)."""
    return row.source_key in keys or (row.handover_id is not None and row.handover_id in ids)


def preview(db: Session, content: bytes, mapping_raw: Optional[str] = None) -> dict:
    sheet = read_upload(content)
    headers, rows = sheet_rows(sheet)
    categories = db.query(AssetCategory).order_by(AssetCategory.position, AssetCategory.id).all()
    mapping = _validate_mapping(mapping_raw, headers, categories)
    try:
        parsed = parse_rows(headers, rows, mapping)
    except HTTPException as error:
        parsed, mapping_error = [], error.detail
    else:
        mapping_error = None
    _mark_second_wave(db, parsed)
    existing = _existing_keys(db, (r.source_key for r in parsed))
    existing_ids = _existing_ids(db, parsed)
    return {
        "sheet": sheet.title,
        "columns": [
            {"index": i, "letter": get_column_letter(i + 1), "header": h, "target": mapping.get(i, "skip")}
            for i, h in enumerate(headers) if h or mapping.get(i, "skip") != "skip"
        ],
        "mapping_error": mapping_error,
        "rows": [
            {
                "row": r.row,
                "start": r.start.isoformat(timespec="minutes") if r.start else None,
                "end": r.end.isoformat(timespec="minutes") if r.end else None,
                "person": r.person,
                "items": {k: len(v) for k, v in r.items.items()},
                "sample": next((f"{ACTION_LABELS[i.action]} {i.title} — {i.description}" for v in r.items.values() for i in v), ""),
                "has_notes": bool(r.notes),
                "duplicate": _is_duplicate(r, existing, existing_ids),
                "error": r.error,
            }
            for r in parsed
        ],
    }


def _mark_second_wave(db: Session, parsed: List[ParsedRow]) -> int:
    """Строки сотрудников 2 волны не загружаются: помечаем их, как строки с причиной пропуска."""
    second_wave = [u for u in db.query(User).filter(User.wave == 2).all()]
    if not second_wave:
        return 0
    marked = 0
    for row in parsed:
        if not row.error and _match_user(second_wave, row.person):
            row.error = SECOND_WAVE_SKIPPED
            marked += 1
    return marked


# --- Применение ---------------------------------------------------------------

@dataclass
class ImportStats:
    handovers: int = 0
    duplicates: int = 0
    errors: List[str] = field(default_factory=list)
    assets_created: int = 0
    assets_updated: int = 0
    entries: int = 0
    # Статусы, выставленные по последней передаче файла
    assets_closed: int = 0
    assets_reopened: int = 0
    last_handover: Optional[str] = None
    # Строки сотрудников 2 волны — в журнал Excel они не входят
    second_wave_skipped: int = 0


class _AssetIndex:
    """Поиск кейса: по номеру CASE# в названии, иначе по точному названию, иначе по началу текста."""

    def __init__(self, db: Session):
        self.by_case: Dict[Tuple[str, str], Asset] = {}
        self.by_title: Dict[Tuple[str, str], Asset] = {}
        self.titles: Dict[str, List[Tuple[str, Asset]]] = defaultdict(list)
        for asset in db.query(Asset).order_by(Asset.id).all():
            self.add(asset)

    def add(self, asset: Asset) -> None:
        for number in _CASE_RE.findall(asset.title):
            self.by_case.setdefault((asset.asset_type, number), asset)
        title = _norm(asset.title)
        if (asset.asset_type, title) not in self.by_title:
            self.by_title[(asset.asset_type, title)] = asset
            self.titles[asset.asset_type].append((title, asset))

    def find(self, category: str, item: ParsedItem) -> Optional[Asset]:
        if item.case_id:
            found = self.by_case.get((category, item.case_id.split("#", 1)[1]))
            if found:
                return found
        found = self.by_title.get((category, _norm(item.title)))
        if found:
            return found
        # Название с « - » внутри (выгрузка пишет «<название> - <текст>»): ищем самое длинное совпадающее начало
        body = _norm(item.body)
        best: Optional[Tuple[str, Asset]] = None
        for title, asset in self.titles.get(category, []):
            if body.startswith(title) and body[len(title):len(title) + 2].strip() in ("-", "–", "—", "") \
                    and (best is None or len(title) > len(best[0])):
                best = (title, asset)
        return best[1] if best else None


def _match_user(users: List[User], person: str) -> Optional[User]:
    target = _norm(person)
    if not target:
        return None
    for user in users:
        name = _norm(user.name)
        if name == target or target in name.split():
            return user
    return None


def _match_shift(db: Session, start: datetime, user: Optional[User]) -> Optional[Shift]:
    """Смена из графика — только если её отработал именно этот сотрудник; чужую смену не привязываем."""
    if not user:
        return None
    candidates = db.query(Shift).filter(Shift.date == start.strftime("%Y-%m-%d"), Shift.start_time == start.strftime("%H:%M")).all()
    for shift in candidates:
        if shift.user_id == user.id or any(s.user_id == user.id for s in shift.segments):
            return shift
    return None


def apply_import(db: Session, content: bytes, mapping_raw: Optional[str], importer: User) -> ImportStats:
    sheet = read_upload(content)
    headers, rows = sheet_rows(sheet)
    categories = db.query(AssetCategory).order_by(AssetCategory.position, AssetCategory.id).all()
    mapping = _validate_mapping(mapping_raw, headers, categories)
    parsed = parse_rows(headers, rows, mapping)
    second_wave_rows = _mark_second_wave(db, parsed)

    statuses = db.query(AssetStatusOption).order_by(AssetStatusOption.position).all()
    if not statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Не настроено ни одного статуса")
    closed = {s.key for s in statuses if s.is_closed}
    default_status = catalog.resolve_status(db, None)
    closed_status = next((s.key for s in statuses if s.is_closed), default_status)
    users = db.query(User).all()
    index = _AssetIndex(db)
    existing = _existing_keys(db, (r.source_key for r in parsed))
    existing_ids = _existing_ids(db, parsed)
    stats = ImportStats(second_wave_skipped=second_wave_rows)
    touched: set = set()
    # Последний текст по каждому кейсу — чтобы не дублировать одинаковые записи истории
    last_text: Dict[int, str] = {}
    for entry in db.query(AssetEntry).filter(AssetEntry.text.isnot(None)).order_by(AssetEntry.id).all():
        last_text[entry.asset_id] = _norm(entry.text)

    # Журнал часто ведут «новые сверху» — применяем передачи по времени, иначе более старое
    # «Continue» снова открыло бы кейс, закрытый позже
    for row in sorted(parsed, key=lambda r: r.start or datetime.min):
        if row.error == SECOND_WAVE_SKIPPED:
            continue
        if row.error:
            stats.errors.append(f"Строка {row.row}: {row.error}")
            continue
        if _is_duplicate(row, existing, existing_ids):
            stats.duplicates += 1
            continue
        existing.add(row.source_key)
        when = _to_utc(row.end or row.start)
        author = _match_user(users, row.person)
        author_name = author.name if author else (row.person or importer.name)
        shift = _match_shift(db, row.start, author)

        handover = ShiftHandover(
            from_shift_id=shift.id if shift else None,
            handover_notes=row.notes or IMPORT_NOTE,
            source_key=row.source_key,
            wave=1,  # журнал Excel — только 1 волна
            created_at=when,
        )
        db.add(handover)
        db.flush()
        stats.handovers += 1
        linked: set = set()

        for category_key, items in row.items.items():
            for item in items:
                asset = index.find(category_key, item)
                if asset is None:
                    asset = Asset(
                        title=item.title,
                        description=item.description or item.title,
                        asset_type=category_key,
                        status=closed_status if item.action in ("close", "open-close") else default_status,
                        created_at=when,
                        updated_at=when,
                    )
                    db.add(asset)
                    db.flush()
                    index.add(asset)
                    stats.assets_created += 1
                    db.add(AssetEntry(asset_id=asset.id, kind="created", new_status=asset.status, text=item.description,
                                      author_id=author.id if author else None, author_name=author_name,
                                      shift_id=handover.from_shift_id, handover_id=handover.id, created_at=when))
                    stats.entries += 1
                    last_text[asset.id] = _norm(item.description)
                else:
                    old = asset.status
                    if item.action in ("close", "open-close"):
                        new = closed_status
                    elif item.action == "open" or old in closed:
                        new = default_status  # кейс снова в работе
                    else:
                        new = old
                    kind = "status" if new != old else "comment"
                    # «Continue» с тем же текстом, что и в прошлую смену, — кейс просто переходит дальше,
                    # новую запись в историю не пишем (иначе история заполняется копиями)
                    if kind == "status" or _norm(item.description) != last_text.get(asset.id):
                        asset.status = new
                        asset.updated_at = max(asset.updated_at or when, when)
                        db.add(AssetEntry(asset_id=asset.id, kind=kind, text=item.description,
                                          old_status=old if kind == "status" else None,
                                          new_status=new if kind == "status" else None,
                                          author_id=author.id if author else None, author_name=author_name,
                                          shift_id=handover.from_shift_id, handover_id=handover.id, created_at=when))
                        stats.entries += 1
                        last_text[asset.id] = _norm(item.description)
                touched.add(asset.id)
                if asset.id not in linked:
                    db.add(HandoverAsset(handover_id=handover.id, asset_id=asset.id))
                    linked.add(asset.id)

    db.flush()
    _sync_with_last_handover(db, parsed, index, closed, closed_status, default_status, importer, stats)
    db.commit()
    stats.assets_updated = len(touched) - stats.assets_created if touched else 0
    stats.errors.sort(key=lambda text: int(re.search(r"\d+", text).group()))
    return stats


def _sync_with_last_handover(db: Session, parsed: List[ParsedRow], index: "_AssetIndex", closed: set,
                             closed_status: str, default_status: str, importer: User, stats: ImportStats) -> None:
    """
    Актуальность кейсов из файла — по последней передаче в нём: кейс открыт, только если он есть
    в последней передаче и не помечен Close / Open-Close; остальные кейсы из файла закрыты.
    Работает и при повторной загрузке того же файла (уже загруженные строки тоже учитываются).
    Кейсы, которых в файле нет вовсе (заведены на сайте), не трогаем.
    """
    rows = [r for r in parsed if not r.error and r.start]
    if not rows:
        return
    last = max(rows, key=lambda r: r.start)  # при равном времени — первая из них в файле
    stats.last_handover = _fmt(last.end or last.start)

    in_file: Dict[int, Asset] = {}
    in_last: set = set()
    closed_in_last: set = set()
    for row in rows:
        for category_key, items in row.items.items():
            for item in items:
                asset = index.find(category_key, item)
                if asset is None:
                    continue
                in_file[asset.id] = asset
                if row is last:
                    in_last.add(asset.id)
                    if item.action in ("close", "open-close"):
                        closed_in_last.add(asset.id)
    still_open = in_last - closed_in_last

    when = _to_utc(last.end or last.start)
    note = f"По последней передаче из Excel ({stats.last_handover})"
    for asset_id, asset in in_file.items():
        is_closed = asset.status in closed
        should_close = asset_id not in still_open
        if should_close == is_closed:
            continue
        old, new = asset.status, closed_status if should_close else default_status
        asset.status = new
        asset.updated_at = max(asset.updated_at or when, when)
        db.add(AssetEntry(asset_id=asset.id, kind="status", text=note, old_status=old, new_status=new,
                          author_id=importer.id, author_name=importer.name, created_at=when))
        stats.entries += 1
        if should_close:
            stats.assets_closed += 1
        else:
            stats.assets_reopened += 1
