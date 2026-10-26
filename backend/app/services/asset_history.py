"""История актива: кто, когда и что сделал."""
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Asset, AssetEntry, User


def add_entry(
    db: Session,
    asset: Asset,
    user: Optional[User],
    kind: str,
    text: Optional[str] = None,
    old_status: Optional[str] = None,
    new_status: Optional[str] = None,
    shift_id: Optional[int] = None,
    handover_id: Optional[int] = None,
) -> AssetEntry:
    entry = AssetEntry(
        asset_id=asset.id,
        kind=kind,
        text=text,
        old_status=old_status,
        new_status=new_status,
        author_id=user.id if user else None,
        author_name=user.name if user else None,
        shift_id=shift_id,
        handover_id=handover_id,
    )
    db.add(entry)
    return entry
