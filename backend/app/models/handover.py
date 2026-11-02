from sqlalchemy import Column, DateTime, Integer, String, Text

from app.core.time import utcnow
from app.db.session import Base


class ShiftHandover(Base):
    __tablename__ = "shift_handovers"

    id = Column(Integer, primary_key=True, index=True)
    from_shift_id = Column(Integer, nullable=True)
    to_shift_id = Column(Integer, nullable=True)
    # Волна, которая передаёт дела (1 — сменные, 2 — дневные «2 через 2»); видят все
    wave = Column(Integer, default=1, nullable=False, server_default='1')
    handover_notes = Column(Text, nullable=False)
    # Откуда пришла передача при импорте из Excel («xlsx:<начало смены>:<фамилия>») — повторный импорт её не задвоит
    source_key = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow)


class HandoverAsset(Base):
    """Связь передачи смены с активами."""

    __tablename__ = "handover_assets"

    id = Column(Integer, primary_key=True, index=True)
    handover_id = Column(Integer, nullable=False)
    asset_id = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String, nullable=True)


class HandoverLog(Base):
    """Плоский журнал передач для экспорта — не зависит от последующего удаления смен и активов."""

    __tablename__ = "handover_logs"

    id = Column(Integer, primary_key=True, index=True)
    log_date = Column(String, nullable=False)
    log_time = Column(String, nullable=False)
    from_shift_user = Column(String, nullable=False)
    from_shift_time = Column(String, nullable=False)
    to_shift_user = Column(String, nullable=False)
    to_shift_time = Column(String, nullable=False)
    handover_notes = Column(Text, nullable=False)
    assets_info = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)
