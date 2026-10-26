"""Управление сотрудниками.

Коллеги видят только те контакты, которые сотрудник разрешил показывать; администраторы — все.
Логин и пароль не показываются никому, кроме самого сотрудника (в его профиле); администратор может
лишь задать новый логин или сбросить пароль.
"""
import secrets
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_current_admin_user
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models import User
from app.schemas.common import Message
from app.schemas.user import PasswordResetResult, UserAdminView, UserCreate, UserPublic, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])

# Без похожих символов (0/O, 1/l/I), чтобы временный пароль легко продиктовать
_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_temporary_password(length: int = 10) -> str:
    return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден")
    return user


def _ensure_username_free(db: Session, username: str, exclude_id: int = 0) -> None:
    if db.query(User).filter(User.username == username, User.id != exclude_id).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пользователь с таким логином уже существует")


@router.get("/", response_model=List[UserAdminView])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    return db.query(User).order_by(User.name).all()


def public_view(user: User, viewer: User) -> UserPublic:
    """Контакты, скрытые сотрудником, не покидают сервер. Себя и администратору — без фильтра."""
    full = viewer.is_admin or viewer.id == user.id
    return UserPublic(
        id=user.id,
        name=user.name,
        position=user.position,
        is_active=user.is_active,
        phone=user.phone if full or user.show_phone else None,
        telegram_id=user.telegram_id if full or user.show_telegram else None,
        email=user.email if full or user.show_email else None,
    )


@router.get("/public", response_model=List[UserPublic])
def list_users_public(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Справочник «Команда» и график смен: имена, должности и разрешённые контакты."""
    return [public_view(user, current_user) for user in db.query(User).order_by(User.name).all()]


@router.post("/", response_model=UserAdminView)
def create_user(user_in: UserCreate, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    _ensure_username_free(db, user_in.username)
    data = user_in.model_dump()
    data["hashed_password"] = get_password_hash(data.pop("password"))
    # Пароль придумал администратор — при первом входе сотрудник задаст свой
    user = User(**data, must_change_password=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserAdminView)
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    return _get_user_or_404(db, user_id)


@router.put("/{user_id}", response_model=UserAdminView)
def update_user(
    user_id: int,
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    user = _get_user_or_404(db, user_id)

    is_self = user.id == current_user.id
    # Защита от случайной блокировки: администратор не может снять права или отключить сам себя
    if is_self and not user_in.is_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя снять права администратора с самого себя")
    if is_self and user_in.is_active is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя отключить собственную учётную запись")

    if user_in.username:
        _ensure_username_free(db, user_in.username, exclude_id=user.id)
        user.username = user_in.username

    for key, value in user_in.model_dump(exclude={"username", "is_active"}).items():
        setattr(user, key, value)
    if user_in.is_active is not None:
        if user.is_active and not user_in.is_active:
            user.revoke_sessions()  # отключённый сотрудник сразу теряет доступ во всех браузерах
        user.is_active = user_in.is_active

    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=PasswordResetResult)
def reset_password(user_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    """Выдаёт временный пароль (показывается один раз). При входе сотрудник обязан сменить его."""
    user = _get_user_or_404(db, user_id)
    temporary = generate_temporary_password()
    user.hashed_password = get_password_hash(temporary)
    user.must_change_password = True
    user.revoke_sessions()  # если пароль утёк — открытые сессии злоумышленника закрываются
    db.commit()
    return PasswordResetResult(temporary_password=temporary)


@router.delete("/{user_id}", response_model=Message)
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    user = _get_user_or_404(db, user_id)
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя удалить самого себя")
    db.delete(user)
    db.commit()
    return Message(message="Сотрудник удалён")
