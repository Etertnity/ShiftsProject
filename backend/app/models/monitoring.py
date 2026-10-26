from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.core.time import utcnow
from app.db.session import Base


class Vessel(Base):
    """Судно в ICMP-мониторе: название и item ID графика потерь в Zabbix."""

    __tablename__ = "monitor_vessels"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    # Скрытые суда не загружаются и не показываются, но их можно вернуть
    is_hidden = Column(Boolean, nullable=False, default=False)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utcnow)
