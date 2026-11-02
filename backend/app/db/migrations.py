"""Лёгкие идемпотентные миграции: безопасно выполняются при каждом старте.

create_all() создаёт только новые таблицы, а новые колонки в существующих таблицах
и стартовое наполнение справочников добавляем здесь.
"""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.db.seed_vessels import DEFAULT_VESSELS
from app.models import Asset, AssetCategory, AssetStatusOption, Vessel

logger = logging.getLogger(__name__)

# Категории и статусы, которые раньше были зашиты в коде. Ключи совпадают со значениями в старой БД.
DEFAULT_CATEGORIES = [
    {"key": "CASE", "name": "CASE", "description": "Новые и закрытые кейсы", "color": "sky", "icon": "briefcase", "auto_include_in_handover": True},
    {"key": "ORANGE_CASE", "name": "Orange CASE", "description": "Взаимодействие с Orange: открытые и закрытые кейсы, неотвеченные запросы", "color": "orange", "icon": "globe", "auto_include_in_handover": False},
    {"key": "CHANGE_MANAGEMENT", "name": "Change Management", "description": "Запросы на изменения, окна работ и риски", "color": "emerald", "icon": "wrench", "auto_include_in_handover": False},
    {"key": "CLIENT_REQUESTS", "name": "Обращения клиентов", "description": "Обращения и неотвеченные письма", "color": "violet", "icon": "message", "auto_include_in_handover": False},
]

DEFAULT_STATUSES = [
    {"key": "Active", "name": "Активен", "color": "green", "is_closed": False, "is_default": True},
    {"key": "On Hold", "name": "На удержании", "color": "amber", "is_closed": False, "is_default": False},
    {"key": "Completed", "name": "Завершён", "color": "blue", "is_closed": True, "is_default": False},
    {"key": "Closed", "name": "Закрыт", "color": "slate", "is_closed": True, "is_default": False},
]


# (таблица, колонка, SQL-описание) — добавляются, если их ещё нет в старой БД
NEW_COLUMNS = [
    ("assets", "custom_fields", "TEXT"),
    ("users", "must_change_password", "BOOLEAN NOT NULL DEFAULT 0"),
    ("users", "show_phone", "BOOLEAN NOT NULL DEFAULT 0"),
    ("users", "show_telegram", "BOOLEAN NOT NULL DEFAULT 1"),
    ("users", "show_email", "BOOLEAN NOT NULL DEFAULT 1"),
    ("users", "token_version", "INTEGER NOT NULL DEFAULT 0"),
    ("shift_handovers", "source_key", "VARCHAR"),
    ("users", "wave", "INTEGER NOT NULL DEFAULT 1"),
    ("shift_handovers", "wave", "INTEGER NOT NULL DEFAULT 1"),
]


# (имя, таблица, колонки) — создаются, если их нет; имена совпадают с теми, что даёт index=True в моделях
INDEXES = [
    ("ix_handover_assets_handover_id", "handover_assets", "handover_id"),
    ("ix_handover_assets_asset_id", "handover_assets", "asset_id"),
    ("ix_shift_handovers_created_at", "shift_handovers", "created_at"),
    ("ix_shifts_date", "shifts", "date"),
    ("ix_assets_updated_at", "assets", "updated_at"),
    ("ix_assets_asset_type", "assets", "asset_type"),
    ("ix_asset_entries_author_id", "asset_entries", "author_id"),
    ("ix_asset_entries_created_at", "asset_entries", "created_at"),
]


def _create_indexes(engine) -> None:
    with engine.begin() as conn:
        for name, table, columns in INDEXES:
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({columns})"))


def _add_missing_columns(engine) -> None:
    inspector = inspect(engine)
    for table, column, ddl in NEW_COLUMNS:
        existing = {col["name"] for col in inspector.get_columns(table)}
        if column not in existing:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            logger.info("Миграция: добавлена колонка %s.%s", table, column)


def _seed_catalog(db: Session) -> None:
    if db.query(AssetCategory).count() == 0:
        for position, data in enumerate(DEFAULT_CATEGORIES):
            db.add(AssetCategory(position=position, **data))
        logger.info("Созданы стандартные категории активов")

    if db.query(AssetStatusOption).count() == 0:
        for position, data in enumerate(DEFAULT_STATUSES):
            db.add(AssetStatusOption(position=position, **data))
        logger.info("Созданы стандартные статусы активов")
    db.flush()

    # Если в старой БД встречаются типы/статусы вне стандартного набора — заводим под них записи,
    # чтобы такие активы не «потерялись» в интерфейсе
    known_categories = {key for (key,) in db.query(AssetCategory.key).all()}
    next_pos = db.query(AssetCategory).count()
    for (asset_type,) in db.query(Asset.asset_type).distinct().all():
        if asset_type and asset_type not in known_categories:
            db.add(AssetCategory(key=asset_type, name=asset_type, color="slate", icon="folder", position=next_pos))
            known_categories.add(asset_type)
            next_pos += 1

    known_statuses = {key for (key,) in db.query(AssetStatusOption.key).all()}
    next_pos = db.query(AssetStatusOption).count()
    for (status,) in db.query(Asset.status).distinct().all():
        if status and status not in known_statuses:
            db.add(AssetStatusOption(key=status, name=status, color="slate", position=next_pos))
            known_statuses.add(status)
            next_pos += 1
    db.commit()


def _seed_vessels(db: Session) -> None:
    if db.query(Vessel).count() == 0:
        db.add_all(Vessel(item_id=item_id, name=name, position=index) for index, (item_id, name) in enumerate(DEFAULT_VESSELS))
        db.commit()
        logger.info("Загружен стартовый список судов для ICMP-монитора: %s", len(DEFAULT_VESSELS))


def run_migrations(engine, db: Session) -> None:
    _add_missing_columns(engine)
    _create_indexes(engine)
    _seed_catalog(db)
    _seed_vessels(db)
