"""Создание таблиц и администратора по умолчанию при старте."""
import logging
import secrets

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_password_hash
from app.db.session import Base
from app.models import User

logger = logging.getLogger(__name__)


def create_tables(engine) -> None:
    # Создаём только отсутствующие таблицы — существующие данные не трогаем
    Base.metadata.create_all(bind=engine)


def create_default_admin(db: Session) -> None:
    # Администратор создаётся, только если в системе ещё нет ни одного — иначе удалённый «по умолчанию»
    # вернулся бы после перезапуска с известным паролем
    if db.query(User).filter((User.username == settings.default_admin_username) | (User.is_admin.is_(True))).first():
        return
    password = settings.default_admin_password
    generated = not password
    if generated:
        password = secrets.token_urlsafe(12)
    db.add(User(
        username=settings.default_admin_username,
        hashed_password=get_password_hash(password),
        name=settings.default_admin_name,
        position=settings.default_admin_position,
        is_active=True,
        is_admin=True,
        # Пароль по умолчанию известен всем — при первом входе его нужно сменить
        must_change_password=True,
    ))
    db.commit()
    if generated:
        # Единственный раз, когда пароль виден: при первом входе система потребует задать свой
        logger.warning(
            "Создан администратор «%s» с временным паролем: %s — войдите и смените его",
            settings.default_admin_username, password,
        )
    else:
        logger.info("Создан администратор по умолчанию: %s", settings.default_admin_username)
