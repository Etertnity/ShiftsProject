from typing import Dict, List, Optional

from pydantic import BaseModel


class ImportColumn(BaseModel):
    index: int
    letter: str
    header: str
    # date | person | notes | skip | category:<KEY>
    target: str


class ImportRow(BaseModel):
    row: int
    start: Optional[str] = None
    end: Optional[str] = None
    person: str = ""
    items: Dict[str, int] = {}
    sample: str = ""
    has_notes: bool = False
    duplicate: bool = False
    error: Optional[str] = None


class ImportPreview(BaseModel):
    sheet: str
    columns: List[ImportColumn]
    mapping_error: Optional[str] = None
    rows: List[ImportRow]


class ImportResult(BaseModel):
    handovers: int
    duplicates: int
    errors: List[str]
    assets_created: int
    assets_updated: int
    entries: int
