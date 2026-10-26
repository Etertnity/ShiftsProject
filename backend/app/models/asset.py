from sqlalchemy import Column, DateTime, Integer, String, Text

from app.core.time import utcnow
from app.db.session import Base


class Asset(Base):
    """Актив — кейс, change, обращение клиента и т.п., который переходит из смены в смену."""

    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    asset_type = Column(String, nullable=False)  # ключ категории (asset_categories.key)
    status = Column(String, nullable=False)  # ключ статуса (asset_statuses.key)
    custom_fields = Column(Text, nullable=True)  # JSON: значения полей категории
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class AssetEntry(Base):
    """Запись в истории актива: комментарий смены, смена статуса, создание."""

    __tablename__ = "asset_entries"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, nullable=False, index=True)
    kind = Column(String, nullable=False, default="comment")  # created, comment, status, edit
    text = Column(Text, nullable=True)
    old_status = Column(String, nullable=True)
    new_status = Column(String, nullable=True)
    author_id = Column(Integer, nullable=True)
    # Имя копируется, чтобы история читалась и после удаления сотрудника
    author_name = Column(String, nullable=True)
    shift_id = Column(Integer, nullable=True)
    # Запись сделана в рамках передачи смены — показываем её в карточке этой передачи
    handover_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow)
