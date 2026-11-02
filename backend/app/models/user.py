from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.core.time import utcnow
from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    position = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    telegram_id = Column(String, nullable=True)
    email = Column(String, nullable=True)
    # Какие контакты видят коллеги (справочник «Команда»). Администраторы видят всё
    show_phone = Column(Boolean, default=False, nullable=False, server_default='0')
    show_telegram = Column(Boolean, default=True, nullable=False, server_default='1')
    show_email = Column(Boolean, default=True, nullable=False, server_default='1')
    # Волна передачи смен: 1 — сменные 24/7 (день/ночь), 2 — дневные «2 через 2», передают друг другу
    wave = Column(Integer, default=1, nullable=False, server_default='1')
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    # Пароль выдан администратором (новый сотрудник или сброс) — при входе нужно задать свой
    must_change_password = Column(Boolean, default=False, nullable=False, server_default='0')
    # Версия сессий: растёт при смене/сброса пароля и отключении — старые токены становятся недействительны
    token_version = Column(Integer, default=0, nullable=False, server_default='0')
    created_at = Column(DateTime, default=utcnow)

    def revoke_sessions(self) -> None:
        self.token_version = (self.token_version or 0) + 1
