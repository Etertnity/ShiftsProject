"""Общие зависимости FastAPI: сессия БД и текущий пользователь."""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Сессия истекла, войдите заново",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if not payload:
        raise credentials_exception
    user = db.query(User).filter(User.username == payload["sub"]).first()
    # Пароль сменили/сбросили после выдачи токена — сессия больше не действует
    if user is None or payload.get("ver", 0) != (user.token_version or 0):
        raise credentials_exception
    return user


def get_user_pending_password_change(current_user: User = Depends(get_current_user)) -> User:
    """Пускает и с временным паролем — только для «кто я» и смены пароля."""
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Учётная запись отключена")
    return current_user


def get_current_active_user(current_user: User = Depends(get_user_pending_password_change)) -> User:
    # С временным паролем (новый сотрудник, сброс, администратор по умолчанию) доступна только смена пароля.
    # Проверка на сервере, а не только в интерфейсе — иначе API можно было бы вызывать напрямую
    if current_user.must_change_password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Сначала смените временный пароль")
    return current_user


def get_current_admin_user(current_user: User = Depends(get_current_active_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав: нужен администратор")
    return current_user
