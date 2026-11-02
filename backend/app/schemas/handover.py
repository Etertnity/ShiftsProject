from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, BeforeValidator, Field

from app.schemas.asset import TEXT_MAX, AssetEntryOut, AssetResponse
from app.schemas.common import InputModel, LimitedStr, UTCDateTime, _empty_to_none

# Из <select> без выбора приходит пустая строка — считаем это "не указано"
OptionalShiftId = Annotated[Optional[int], BeforeValidator(_empty_to_none)]


class HandoverAssetUpdate(InputModel):
    """Что произошло с активом за смену: новый статус и/или короткая заметка."""

    asset_id: int
    status: Optional[str] = Field(default=None, max_length=100)
    text: LimitedStr(TEXT_MAX) = None


class HandoverCreate(InputModel):
    from_shift_id: OptionalShiftId = None
    to_shift_id: OptionalShiftId = None
    # Не указана — берётся по сотруднику сдающей смены (или по автору передачи)
    wave: Optional[Literal[1, 2]] = None
    handover_notes: str = Field(min_length=1, max_length=TEXT_MAX)
    asset_ids: List[int] = Field(default_factory=list, max_length=1000)
    # Обновления активов применяются вместе с передачей одной транзакцией и пишутся в их историю
    updates: List[HandoverAssetUpdate] = Field(default_factory=list, max_length=1000)


class HandoverResponse(BaseModel):
    id: int
    from_shift_id: Optional[int] = None
    to_shift_id: Optional[int] = None
    wave: int = 1
    handover_notes: str
    assets: List[AssetResponse]
    # Записи истории, сделанные в этой передаче
    entries: List[AssetEntryOut] = Field(default_factory=list)
    created_at: UTCDateTime


class HandoverLogItem(BaseModel):
    id: int
    date: str
    time: str
    from_shift_user: str
    from_shift_time: str
    to_shift_user: str
    to_shift_time: str
    handover_notes: str
    assets_info: str


class HandoverExport(BaseModel):
    data: List[HandoverLogItem]
    total: int
    success: bool = True


class HandoverClearResult(BaseModel):
    message: str
    deleted_handovers: int
    deleted_logs: int
