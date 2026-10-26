"""Подключение к БД и фабрика сессий."""
import logging
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

Base = declarative_base()


def _ensure_sqlite_dir(database_url: str) -> None:
    """Для SQLite заранее создаём каталог под файл БД, иначе engine не сможет его открыть."""
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite") or not url.database or url.database == ":memory:":
        return
    db_dir = Path(url.database).expanduser().resolve().parent
    try:
        db_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        logger.warning("Не удалось создать каталог БД %s: %s", db_dir, exc)


def _tune_sqlite(dbapi_connection, _record) -> None:
    """WAL: чтение не ждёт записи, а одновременные записи ждут друг друга до 5 с вместо ошибки «database is locked»."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")  # безопасно в режиме WAL и заметно быстрее FULL
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.close()


def build_engine(database_url: str):
    _ensure_sqlite_dir(database_url)
    is_sqlite = database_url.startswith("sqlite")
    connect_args = {"check_same_thread": False} if is_sqlite else {}
    engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=not is_sqlite)
    if is_sqlite and ":memory:" not in database_url:
        event.listen(engine, "connect", _tune_sqlite)
    return engine


engine = build_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
