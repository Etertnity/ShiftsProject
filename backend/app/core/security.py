"""Хэширование паролей и работа с JWT."""
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Хэш для сравнения, когда логина нет: проверка занимает столько же времени,
# и по скорости ответа нельзя понять, существует ли пользователь
_DUMMY_HASH = pwd_context.hash("timing-equalizer-not-a-real-password")


def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    if not hashed_password:
        pwd_context.verify(plain_password, _DUMMY_HASH)
        return False
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, token_version: int = 0, expires_delta: Optional[timedelta] = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    # ver — версия сессий пользователя: смена/сброс пароля увеличивает её, и старые токены перестают действовать
    payload = {"sub": subject, "ver": token_version, "iat": now, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> Optional[dict]:
    """Полезная нагрузка токена или None, если токен поддельный или просрочен."""
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],  # алгоритм фиксирован — подмена на "none" невозможна
            options={"require": ["sub", "exp"]},
        )
    except jwt.PyJWTError:
        return None
    if not isinstance(payload.get("sub"), str):
        return None
    return payload
