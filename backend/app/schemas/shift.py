from datetime import datetime
from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, Field, PlainSerializer

from app.schemas.common import InputModel, LimitedStr, OrmModel, UTCDateTime

DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"
TIME_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"
LOCAL_DATETIME_PATTERN = r"^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$"

# Местное время смены (МСК) без часового пояса: "2026-10-19T15:00"
LocalDateTime = Annotated[datetime, PlainSerializer(lambda value: value.strftime("%Y-%m-%dT%H:%M"), return_type=str)]


class ShiftCreate(InputModel):
    date: str = Field(pattern=DATE_PATTERN)
    start_time: str = Field(pattern=TIME_PATTERN)
    end_time: str = Field(pattern=TIME_PATTERN)
    shift_type: Literal["day", "night"]
    user_id: int = Field(gt=0)
    notes: LimitedStr(5000) = None


class ShiftBulkCreate(BaseModel):
    shifts: List[ShiftCreate] = Field(min_length=1)


class ShiftSegmentOut(OrmModel):
    user_id: int
    user_name: str
    start_at: LocalDateTime
    end_at: LocalDateTime


class ShiftResponse(OrmModel):
    id: int
    date: str
    start_time: str
    end_time: str
    shift_type: str
    user_id: int
    user_name: str
    position: str
    status: Optional[str] = None
    notes: Optional[str] = None
    segments: List[ShiftSegmentOut] = Field(default_factory=list)
    created_at: UTCDateTime
    updated_at: UTCDateTime


class ShiftAssign(BaseModel):
    """Быстрая замена дежурного на всю смену."""

    user_id: int = Field(gt=0)


class ShiftSwap(BaseModel):
    """Две смены меняются сотрудниками (рокировка)."""

    shift_ids: List[int] = Field(min_length=2, max_length=2)


class ShiftPart(BaseModel):
    user_id: int = Field(gt=0)
    # С какого момента работает этот сотрудник; у первой части — начало смены
    start_at: str = Field(pattern=LOCAL_DATETIME_PATTERN)


class ShiftSplit(BaseModel):
    """Разделение смены между сотрудниками. Пустой список или одна часть — смена целиком за одним."""

    parts: List[ShiftPart] = Field(default_factory=list, max_length=6)


class ScheduleGenerate(BaseModel):
    date_from: str = Field(pattern=DATE_PATTERN)
    date_to: str = Field(pattern=DATE_PATTERN)
    # Порядок ротации: первый выходит в день date_from, следующий — днём позже и т.д.
    user_ids: List[int] = Field(min_length=3, max_length=20)
    # fill — заполнить только пустые слоты; replace — удалить смены периода и построить заново
    mode: Literal["fill", "replace"] = "fill"
    preview: bool = True


class GeneratedShift(BaseModel):
    date: str
    shift_type: str
    start_time: str
    end_time: str
    user_id: int
    user_name: str


class ScheduleGenerateResult(BaseModel):
    shifts: List[GeneratedShift]
    created: int
    skipped: int
    removed: int
    warnings: List[str] = Field(default_factory=list)


class ShiftStatsItem(BaseModel):
    user_id: int
    name: str
    planned_shifts: int
    planned_hours: float
    worked_shifts: int
    worked_hours: float
    day_shifts: int
    night_shifts: int
    partial_shifts: int


class ShiftStats(BaseModel):
    date_from: str
    date_to: str
    items: List[ShiftStatsItem]


# --- Табель: та же раскладка, что в Excel-файле графика сменных ---------------------

class TimesheetDay(BaseModel):
    day: int
    weekday: str  # Пн … Вс


class TimesheetCell(BaseModel):
    day: int
    kind: Literal["day", "night"]
    hours: float
    # worked — отработано (зелёный), plan — ещё впереди, changed — не по стандартному графику (жёлтый),
    # missed — по графику была смена, но не отработана (красный)
    status: Literal["worked", "plan", "changed", "missed"]


class TimesheetRow(BaseModel):
    user_id: int
    name: str
    worked: List[TimesheetCell]
    standard: List[TimesheetCell]
    worked_shifts: float
    standard_shifts: float


class Timesheet(BaseModel):
    month: str  # YYYY-MM
    days: List[TimesheetDay]
    rows: List[TimesheetRow]


class ScheduleImportMonth(BaseModel):
    month: str  # YYYY-MM
    label: str
    new: int
    changed: int
    same: int
    people: List[str]


class ScheduleImportPreview(BaseModel):
    sheet: str
    months: List[ScheduleImportMonth]
    unknown_people: List[str]
    warnings: List[str]


class ScheduleImportResult(BaseModel):
    created: int
    updated: int
    unchanged: int
    skipped: int
    warnings: List[str]
