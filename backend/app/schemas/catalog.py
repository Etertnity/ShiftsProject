from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import InputModel, OptionalStr

# Набор ограничен, чтобы фронтенд мог заранее знать классы Tailwind для каждого цвета/иконки
ColorKey = Literal[
    "slate", "sky", "blue", "indigo", "violet", "pink", "rose", "red",
    "orange", "amber", "emerald", "green", "teal", "cyan",
]
IconKey = Literal[
    "folder", "briefcase", "globe", "wrench", "message", "alert", "server", "shield",
    "phone", "bug", "zap", "clock", "mail", "users", "database", "file",
]
FieldType = Literal["text", "textarea", "number", "date", "select", "checkbox", "url"]


class CategoryFieldIn(InputModel):
    id: Optional[int] = None
    label: str = Field(min_length=1, max_length=80)
    field_type: FieldType = "text"
    options: List[str] = Field(default_factory=list)
    placeholder: OptionalStr = None
    required: bool = False
    show_in_card: bool = True

    @field_validator("options")
    @classmethod
    def _clean_options(cls, value: List[str]) -> List[str]:
        # Пустые и повторяющиеся варианты убираем, порядок сохраняем
        return list(dict.fromkeys(v.strip() for v in value if v and v.strip()))


class CategoryIn(InputModel):
    name: str = Field(min_length=1, max_length=60)
    description: OptionalStr = None
    color: ColorKey = "sky"
    icon: IconKey = "folder"
    is_active: bool = True
    auto_include_in_handover: bool = False
    fields: List[CategoryFieldIn] = Field(default_factory=list)


class CategoryFieldOut(BaseModel):
    id: int
    key: str
    label: str
    field_type: str
    options: List[str]
    placeholder: Optional[str] = None
    required: bool
    show_in_card: bool
    position: int


class CategoryOut(BaseModel):
    id: int
    key: str
    name: str
    description: Optional[str] = None
    color: str
    icon: str
    position: int
    is_active: bool
    auto_include_in_handover: bool
    fields: List[CategoryFieldOut]
    asset_count: int = 0


class OrderIn(BaseModel):
    ids: List[int] = Field(min_length=1)


class StatusIn(InputModel):
    id: Optional[int] = None
    name: str = Field(min_length=1, max_length=40)
    color: ColorKey = "slate"
    is_closed: bool = False
    is_default: bool = False


class StatusesIn(BaseModel):
    statuses: List[StatusIn] = Field(min_length=1)


class StatusOut(BaseModel):
    id: int
    key: str
    name: str
    color: str
    is_closed: bool
    is_default: bool
    position: int
    asset_count: int = 0


class CatalogOut(BaseModel):
    categories: List[CategoryOut]
    statuses: List[StatusOut]
