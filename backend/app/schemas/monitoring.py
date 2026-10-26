from typing import List, Optional, Tuple

from pydantic import BaseModel, Field

from app.schemas.common import InputModel, OrmModel


class MonitorConfig(BaseModel):
    configured: bool
    web_url: Optional[str] = None
    warn_threshold: float
    crit_threshold: float
    stale_minutes: int = 15


class VesselOut(OrmModel):
    id: int
    item_id: str
    name: str
    is_hidden: bool
    position: int


class VesselCreate(InputModel):
    name: str = Field(min_length=1, max_length=100)
    # Ссылка на график Zabbix или просто item ID
    item: str = Field(min_length=1)


class VesselUpdate(InputModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    item: Optional[str] = None
    is_hidden: Optional[bool] = None


class VesselHistory(BaseModel):
    item_id: str
    # [unix-время, потери %] по возрастанию времени
    points: List[Tuple[int, float]]
