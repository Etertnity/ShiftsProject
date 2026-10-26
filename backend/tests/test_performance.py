"""Производительность и отсутствие накопления: постраничный журнал, настройки SQLite, индексы, очистка счётчиков."""
from sqlalchemy import text

from app.core import rate_limit
from app.core.rate_limit import LoginLimiter
from app.db.session import engine


def test_handovers_are_paginated(client, user_headers):
    for index in range(25):
        assert client.post("/api/handovers/", headers=user_headers, json={"handover_notes": f"Передача {index}"}).status_code == 200

    first = client.get("/api/handovers/", headers=user_headers)
    assert first.headers["X-Total-Count"] == "25"
    assert len(first.json()) == 20  # по умолчанию — страница из 20
    assert first.json()[0]["handover_notes"] == "Передача 24"  # новые сверху

    rest = client.get("/api/handovers/", headers=user_headers, params={"offset": 20, "limit": 20}).json()
    assert [h["handover_notes"] for h in rest] == [f"Передача {i}" for i in range(4, -1, -1)]

    one = client.get("/api/handovers/", headers=user_headers, params={"limit": 1})
    assert len(one.json()) == 1 and one.headers["X-Total-Count"] == "25"
    assert client.get("/api/handovers/", headers=user_headers, params={"limit": 1000}).status_code == 422


def test_sqlite_tuned_and_indexed(client):
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA journal_mode")).scalar().lower() == "wal"
        assert conn.execute(text("PRAGMA busy_timeout")).scalar() == 5000
        indexes = {row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='index'"))}
    for name in ("ix_handover_assets_handover_id", "ix_shift_handovers_created_at", "ix_shifts_date", "ix_asset_entries_author_id"):
        assert name in indexes


def test_login_limiter_does_not_grow_forever(monkeypatch):
    limiter = LoginLimiter()
    monkeypatch.setattr(rate_limit, "SWEEP_EVERY", 10)
    clock = [1000.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: clock[0])

    # Перебор случайных логинов: каждый раз новый ключ
    for index in range(100):
        limiter.fail(f"user:random{index}")
    # Проверка несуществующего ключа не создаёт запись
    limiter.retry_after("user:never-tried")
    assert "user:never-tried" not in limiter._failures

    # Прошло больше окна блокировки — следующая уборка удаляет всё устаревшее
    clock[0] += limiter.window + 1
    for index in range(10):
        limiter.fail(f"user:new{index}")
    assert len(limiter._failures) == 10
