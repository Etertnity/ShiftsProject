"""Справочники, которые настраивает администратор: категории активов, их поля и статусы."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.time import utcnow
from app.db.session import Base


class AssetCategory(Base):
    """Категория актива (CASE, Orange CASE, …). Активы ссылаются на неё по `key` через assets.asset_type."""

    __tablename__ = "asset_categories"

    id = Column(Integer, primary_key=True, index=True)
    # Неизменяемый ключ — его хранит assets.asset_type, поэтому переименование категории ничего не ломает
    key = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String, nullable=False, default="sky")
    icon = Column(String, nullable=False, default="folder")
    position = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    # Открытые активы категории сразу отмечаются в новой передаче смены
    auto_include_in_handover = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=utcnow)

    fields = relationship(
        "CategoryField",
        back_populates="category",
        order_by="CategoryField.position",
        cascade="all, delete-orphan",
    )


class CategoryField(Base):
    """Дополнительное поле карточки актива в конкретной категории."""

    __tablename__ = "category_fields"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("asset_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    # Ключ значения в assets.custom_fields — не меняется при переименовании поля
    key = Column(String, nullable=False)
    label = Column(String, nullable=False)
    field_type = Column(String, nullable=False, default="text")  # text, textarea, number, date, select, checkbox, url
    options = Column(Text, nullable=True)  # JSON-список вариантов для select
    placeholder = Column(String, nullable=True)
    required = Column(Boolean, nullable=False, default=False)
    show_in_card = Column(Boolean, nullable=False, default=True)
    position = Column(Integer, nullable=False, default=0)

    category = relationship("AssetCategory", back_populates="fields")


class AssetStatusOption(Base):
    """Статус актива. Активы хранят `key` статуса в assets.status."""

    __tablename__ = "asset_statuses"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    color = Column(String, nullable=False, default="slate")
    # Закрытые статусы не требуют внимания смены и не предлагаются в передаче
    is_closed = Column(Boolean, nullable=False, default=False)
    is_default = Column(Boolean, nullable=False, default=False)
    position = Column(Integer, nullable=False, default=0)
