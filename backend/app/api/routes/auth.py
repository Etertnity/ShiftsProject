"""Авторизация и профиль текущего пользователя."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_user_pending_password_change
from app.core.rate_limit import login_limiter
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.auth import LoginRequest, PasswordChanged, Token
from app.schemas.user import PasswordChange, ProfileUpdate, UserResponse

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


def _client_ip(request: Request) -> str:
    # За nginx настоящий адрес приходит в X-Forwarded-For; uvicorn запущен с --proxy-headers
    return request.client.host if request.client else "unknown"


def _issue_token(db: Session, request: Request, username: str, password: str) -> Token:
    ip = _client_ip(request)
    keys = (f"user:{username.strip().lower()}", f"ip:{ip}")
    retry_after = login_limiter.retry_after(*keys)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Слишком много неудачных попыток. Попробуйте через {max(1, retry_after // 60)} мин.",
            headers={"Retry-After": str(retry_after)},
        )
    if len(password.encode()) > 200 or len(username) > 150:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")

    user = db.query(User).filter(User.username == username).first()
    # Пароль проверяется и для несуществующего логина — по времени ответа нельзя угадать логины
    if not verify_password(password, user.hashed_password if user else None):
        login_limiter.fail(*keys)
        logger.warning("Неудачный вход: логин=%r ip=%s", username[:50], ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Учётная запись отключена")
    login_limiter.success(*keys)
    return Token(access_token=create_access_token(user.username, user.token_version or 0))


# /token оставлен для обратной совместимости со старыми клиентами
@router.post("/token", response_model=Token, include_in_schema=False)
@router.post("/api/token", response_model=Token)
def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    return _issue_token(db, request, form_data.username, form_data.password)


@router.post("/api/login", response_model=Token)
def login(request: Request, credentials: LoginRequest, db: Session = Depends(get_db)):
    return _issue_token(db, request, credentials.username, credentials.password)


@router.get("/api/me", response_model=UserResponse)
def read_me(current_user: User = Depends(get_user_pending_password_change)):
    return current_user


@router.put("/api/profile", response_model=UserResponse)
def update_profile(
    profile: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    for key, value in profile.model_dump().items():
        if key.startswith("show_") and value is None:  # старый клиент не прислал — не трогаем
            continue
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/api/profile/password", response_model=PasswordChanged)
def change_password(
    data: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_pending_password_change),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Текущий пароль указан неверно")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Новый пароль должен отличаться от текущего")
    current_user.hashed_password = get_password_hash(data.new_password)
    current_user.must_change_password = False
    # Все остальные сессии (другие браузеры, украденный токен) закрываются
    current_user.revoke_sessions()
    db.commit()
    return PasswordChanged(access_token=create_access_token(current_user.username, current_user.token_version))
