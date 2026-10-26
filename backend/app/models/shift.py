from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.time import utcnow
from app.db.session import Base


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    start_time = Column(String, nullable=False)  # HH:MM
    end_time = Column(String, nullable=False)  # HH:MM
    shift_type = Column(String, nullable=False)  # day / night
    user_id = Column(Integer, nullable=False)
    # Имя и должность копируются на момент создания, чтобы история не ломалась при удалении сотрудника
    user_name = Column(String, nullable=False)
    position = Column(String, nullable=False)
    status = Column(String, default="active")
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Если смену отработали несколько человек — части по времени. Пусто = вся смена за user_id
    segments = relationship(
        "ShiftSegment",
        back_populates="shift",
        order_by="ShiftSegment.start_at",
        cascade="all, delete-orphan",
    )


class ShiftSegment(Base):
    """Часть смены, отработанная конкретным сотрудником (например, Тимофей 09–15, Коля 15–21)."""

    __tablename__ = "shift_segments"

    id = Column(Integer, primary_key=True, index=True)
    shift_id = Column(Integer, ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, nullable=False)
    user_name = Column(String, nullable=False)
    # Местное (московское) время без часового пояса — как и время смен
    start_at = Column(DateTime, nullable=False)
    end_at = Column(DateTime, nullable=False)

    shift = relationship("Shift", back_populates="segments")
