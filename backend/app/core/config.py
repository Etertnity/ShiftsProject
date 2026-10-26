"""Настройки приложения. Все значения можно переопределить переменными окружения или файлом .env."""
import logging
import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def _get_list(name: str, default: str) -> List[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _data_dir() -> Path:
    """Папка с БД — рядом с ней храним сгенерированный ключ подписи токенов."""
    url = os.getenv("DATABASE_URL", "sqlite:///./data/shifts.db")
    if url.startswith("sqlite:///"):
        return Path(url[len("sqlite:///"):]).resolve().parent
    return Path("./data").resolve()


def _secret_key() -> str:
    """Ключ подписи токенов.

    Раньше по умолчанию был ключ, записанный в коде (а значит, в публичном репозитории) — с ним любой мог
    подделать токен администратора. Теперь без SECRET_KEY генерируется случайный ключ и сохраняется рядом с БД,
    чтобы сессии переживали перезапуск.
    """
    env_key = os.getenv("SECRET_KEY", "").strip()
    if env_key:
        return env_key
    key_file = _data_dir() / ".secret_key"
    try:
        if key_file.exists():
            stored = key_file.read_text(encoding="utf-8").strip()
            if len(stored) >= 32:
                return stored
        key_file.parent.mkdir(parents=True, exist_ok=True)
        key = secrets.token_hex(32)
        key_file.write_text(key, encoding="utf-8")
        try:
            key_file.chmod(0o600)
        except OSError:
            pass
        logger.warning("SECRET_KEY не задан — сгенерирован случайный ключ и сохранён в %s", key_file)
        return key
    except OSError:
        logger.warning("SECRET_KEY не задан и сохранить ключ не удалось — после перезапуска все войдут заново")
        return secrets.token_hex(32)


@dataclass(frozen=True)
class Settings:
    app_name: str = "Shift Management API"
    version: str = "2.0.0"

    # development | production. В production выключена документация API и включены строгие проверки
    environment: str = field(default_factory=lambda: os.getenv("APP_ENV", "development").strip().lower())

    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./data/shifts.db"))

    secret_key: str = field(default_factory=_secret_key)
    algorithm: str = "HS256"
    # Смена длится 12 часов, поэтому токен живёт сутки, чтобы не выкидывать сотрудника посреди смены
    access_token_expire_minutes: int = field(
        default_factory=lambda: int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(24 * 60)))
    )

    # Фронтенд и API отдаются с одного адреса (nginx), поэтому CORS по умолчанию не нужен.
    # Если фронтенд живёт на другом домене — перечислите адреса через запятую
    cors_origins: List[str] = field(default_factory=lambda: _get_list("CORS_ORIGINS", ""))

    # Защита от подбора пароля: после N неудачных попыток вход блокируется на M минут
    login_max_attempts: int = field(default_factory=lambda: int(os.getenv("LOGIN_MAX_ATTEMPTS", "5")))
    login_lockout_minutes: int = field(default_factory=lambda: int(os.getenv("LOGIN_LOCKOUT_MINUTES", "15")))
    password_min_length: int = 8

    # Часовой пояс, в котором ведутся смены и формируются журналы передач
    timezone: str = field(default_factory=lambda: os.getenv("APP_TIMEZONE", "Europe/Moscow"))

    # Администратор, создаваемый при первом запуске (если его ещё нет)
    default_admin_username: str = field(default_factory=lambda: os.getenv("DEFAULT_ADMIN_USERNAME", "Sideffect"))
    # Пусто — пароль генерируется случайно и один раз пишется в лог при создании администратора
    default_admin_password: str = field(default_factory=lambda: os.getenv("DEFAULT_ADMIN_PASSWORD", "").strip())
    default_admin_name: str = field(default_factory=lambda: os.getenv("DEFAULT_ADMIN_NAME", "Тимофей"))
    default_admin_position: str = field(default_factory=lambda: os.getenv("DEFAULT_ADMIN_POSITION", "Тех поддержка"))

    # ICMP-монитор: бэкенд ходит в Zabbix сам, учётные данные не попадают в браузер
    zabbix_url: str = field(default_factory=lambda: os.getenv("ZABBIX_URL", "").rstrip("/"))
    zabbix_user: str = field(default_factory=lambda: os.getenv("ZABBIX_USER", ""))
    zabbix_password: str = field(default_factory=lambda: os.getenv("ZABBIX_PASSWORD", ""))
    # Адрес Zabbix для ссылок «открыть график» из браузера (если отличается от внутреннего)
    zabbix_web_url: str = field(default_factory=lambda: (os.getenv("ZABBIX_WEB_URL") or os.getenv("ZABBIX_URL", "")).rstrip("/"))
    monitor_warn_threshold: float = field(default_factory=lambda: float(os.getenv("MONITOR_WARN_THRESHOLD", "40")))
    monitor_crit_threshold: float = field(default_factory=lambda: float(os.getenv("MONITOR_CRIT_THRESHOLD", "60")))

    @property
    def zabbix_configured(self) -> bool:
        return bool(self.zabbix_url and self.zabbix_user and self.zabbix_password)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def api_docs_enabled(self) -> bool:
        # Swagger раскрывает все эндпоинты — в продакшене включается только явно
        return _get_bool("ENABLE_API_DOCS", not self.is_production)


settings = Settings()
