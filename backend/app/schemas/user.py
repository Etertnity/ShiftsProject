from typing import Annotated, Optional

from pydantic import BaseModel, Field

from app.schemas.common import InputModel, LimitedStr, OrmModel, UTCDateTime


# Пароль: не короче 8 символов; верхняя граница — bcrypt всё равно учитывает только первые 72 байта
NewPassword = Annotated[str, Field(min_length=8, max_length=128)]


class UserBase(InputModel):
    name: str = Field(min_length=1, max_length=150)
    position: str = Field(min_length=1, max_length=150)
    phone: LimitedStr(50) = None
    telegram_id: LimitedStr(64) = None
    email: LimitedStr(254) = None


class UserCreate(UserBase):
    username: str = Field(min_length=1, max_length=150)
    password: NewPassword
    is_admin: bool = False


class UserUpdate(UserBase):
    """Правка сотрудника администратором. Пароль здесь не меняется — только через сброс."""

    # Новый логин; пустое значение — оставить прежний. Текущий логин администратору не показываем
    username: LimitedStr(150) = None
    is_admin: bool = False
    is_active: Optional[bool] = None


class ContactVisibility(BaseModel):
    show_phone: bool = False
    show_telegram: bool = True
    show_email: bool = True


class ProfileUpdate(UserBase):
    # Не переданы (старый клиент) — оставляем как было
    show_phone: Optional[bool] = None
    show_telegram: Optional[bool] = None
    show_email: Optional[bool] = None


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: NewPassword


class PasswordResetResult(BaseModel):
    temporary_password: str


class UserPublic(OrmModel):
    """Карточка коллеги для всех сотрудников (график смен, справочник «Команда»).

    Контакты — только те, что сотрудник разрешил показывать; скрытые приходят пустыми.
    Логина и пароля здесь нет.
    """

    id: int
    name: str
    position: str
    is_active: bool
    phone: Optional[str] = None
    telegram_id: Optional[str] = None
    email: Optional[str] = None


class UserAdminView(UserPublic, ContactVisibility):
    """Карточка сотрудника для администратора: все контакты, логина и пароля — нет."""

    is_admin: bool
    must_change_password: bool = False
    created_at: UTCDateTime


class UserResponse(UserAdminView):
    """Собственный профиль — единственное место, где виден логин."""

    username: str
