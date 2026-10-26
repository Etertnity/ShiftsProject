"""Настраиваемые категории/статусы/поля, история активов и обновления в передаче смены."""
import sqlite3

from tests.conftest import login


def catalog(client, headers):
    response = client.get("/api/settings/catalog", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def status_by_key(client, headers, key):
    return next(s for s in catalog(client, headers)["statuses"] if s["key"] == key)


# --- Справочники ------------------------------------------------------------

def test_default_catalog_seeded(client, user_headers):
    data = catalog(client, user_headers)
    assert [c["key"] for c in data["categories"]] == ["CASE", "ORANGE_CASE", "CHANGE_MANAGEMENT", "CLIENT_REQUESTS"]
    assert [s["key"] for s in data["statuses"]] == ["Active", "On Hold", "Completed", "Closed"]
    assert next(s for s in data["statuses"] if s["is_default"])["key"] == "Active"
    assert data["categories"][0]["auto_include_in_handover"] is True


def test_only_admin_changes_settings(client, user_headers):
    assert client.post("/api/settings/categories", headers=user_headers, json={"name": "X"}).status_code == 403
    assert client.put("/api/settings/statuses", headers=user_headers, json={"statuses": [{"name": "A"}]}).status_code == 403


def test_category_with_fields_lifecycle(client, admin_headers, user_headers):
    response = client.post("/api/settings/categories", headers=admin_headers, json={
        "name": "Инциденты", "color": "rose", "icon": "alert",
        "fields": [
            {"label": "Номер тикета", "field_type": "text", "required": True},
            {"label": "Приоритет", "field_type": "select", "options": ["P1", "P2", "P2", " "]},
            {"label": "Дедлайн", "field_type": "date"},
            {"label": "Затронуто клиентов", "field_type": "number"},
        ],
    })
    assert response.status_code == 200, response.text
    category = response.json()
    assert category["key"].startswith("cat_")
    ticket, priority, deadline, affected = category["fields"]
    assert priority["options"] == ["P1", "P2"]

    base = {"title": "Падение API", "description": "Описание", "asset_type": category["key"]}
    # Обязательное поле
    assert client.post("/api/assets/", headers=user_headers, json=base).status_code == 400
    # Неверные типы
    for bad in ({priority["key"]: "P9"}, {deadline["key"]: "завтра"}, {affected["key"]: "много"}):
        values = {ticket["key"]: "INC-1", **bad}
        assert client.post("/api/assets/", headers=user_headers, json={**base, "custom_fields": values}).status_code == 400

    response = client.post("/api/assets/", headers=user_headers, json={**base, "custom_fields": {
        ticket["key"]: " INC-42 ", priority["key"]: "P1", deadline["key"]: "2026-10-20",
        affected["key"]: "12", "unknown": "drop me",
    }})
    assert response.status_code == 200, response.text
    asset = response.json()
    assert asset["status"] == "Active"  # статус по умолчанию
    assert asset["custom_fields"] == {ticket["key"]: "INC-42", priority["key"]: "P1", deadline["key"]: "2026-10-20", affected["key"]: 12}

    # Поиск находит и по значениям полей
    assert len(client.get("/api/assets/", headers=user_headers, params={"search": "inc-42"}).json()) == 1

    # Переименование поля и категории не ломает данные: ключи стабильны
    response = client.put(f"/api/settings/categories/{category['id']}", headers=admin_headers, json={
        "name": "Инциденты 24/7", "color": "red", "icon": "alert",
        "fields": [{**ticket, "label": "Тикет"}, priority],
    })
    assert response.status_code == 200, response.text
    assert response.json()["fields"][0]["key"] == ticket["key"]
    assert response.json()["asset_count"] == 1

    # Категорию с активами удалить нельзя, но можно отключить
    assert client.delete(f"/api/settings/categories/{category['id']}", headers=admin_headers).status_code == 400
    client.put(f"/api/settings/categories/{category['id']}", headers=admin_headers, json={
        "name": "Инциденты 24/7", "is_active": False, "fields": [ticket, priority],
    })
    assert client.post("/api/assets/", headers=user_headers, json={**base, "custom_fields": {ticket["key"]: "x"}}).status_code == 400
    # Старый актив в отключённой категории по-прежнему редактируется
    assert client.put(f"/api/assets/{asset['id']}", headers=user_headers, json={"title": "Новое имя"}).status_code == 200


def test_select_field_requires_options(client, admin_headers):
    response = client.post("/api/settings/categories", headers=admin_headers, json={
        "name": "X", "fields": [{"label": "Выбор", "field_type": "select", "options": []}],
    })
    assert response.status_code == 400


def test_category_order_and_delete(client, admin_headers, user_headers):
    created = client.post("/api/settings/categories", headers=admin_headers, json={"name": "Пустая"}).json()
    ids = [c["id"] for c in catalog(client, user_headers)["categories"]]
    reordered = [ids[-1], *ids[:-1]]
    assert client.put("/api/settings/categories/order", headers=admin_headers, json={"ids": reordered}).status_code == 200
    assert [c["id"] for c in catalog(client, user_headers)["categories"]] == reordered
    assert client.put("/api/settings/categories/order", headers=admin_headers, json={"ids": ids[:2]}).status_code == 400
    assert client.delete(f"/api/settings/categories/{created['id']}", headers=admin_headers).status_code == 200


def test_statuses_replace(client, admin_headers, user_headers):
    statuses = catalog(client, user_headers)["statuses"]
    active, on_hold, completed, closed = statuses
    client.post("/api/assets/", headers=user_headers, json={
        "title": "A", "description": "d", "asset_type": "CASE", "status": "On Hold",
    })

    # Нельзя удалить используемый статус
    payload = [active, completed, closed]
    assert client.put("/api/settings/statuses", headers=admin_headers, json={"statuses": payload}).status_code == 400
    # Нужен хотя бы один открытый
    only_closed = [{**s, "is_closed": True, "is_default": False} for s in statuses]
    assert client.put("/api/settings/statuses", headers=admin_headers, json={"statuses": only_closed}).status_code == 400
    # Два статуса по умолчанию
    two_defaults = [{**active, "is_default": True}, {**on_hold, "is_default": True}, completed, closed]
    assert client.put("/api/settings/statuses", headers=admin_headers, json={"statuses": two_defaults}).status_code == 400

    # Переименование, новый статус, удаление неиспользуемого, новый статус по умолчанию
    new_list = [
        {**on_hold, "name": "Ждём ответа", "is_default": True},
        {**active, "is_default": False},
        {"name": "Эскалирован", "color": "red"},
        completed,
    ]
    response = client.put("/api/settings/statuses", headers=admin_headers, json={"statuses": new_list})
    assert response.status_code == 200, response.text
    result = response.json()
    assert [s["name"] for s in result] == ["Ждём ответа", "Активен", "Эскалирован", "Завершён"]
    assert result[0]["key"] == "On Hold" and result[0]["is_default"] and result[0]["asset_count"] == 1
    assert result[2]["key"].startswith("st_")

    created = client.post("/api/assets/", headers=user_headers, json={"title": "B", "description": "d", "asset_type": "CASE"})
    assert created.json()["status"] == "On Hold"


# --- История ----------------------------------------------------------------

def test_asset_history(client, admin_headers, user_headers):
    asset = client.post("/api/assets/", headers=user_headers, json={
        "title": "VPN", "description": "d", "asset_type": "CASE",
    }).json()

    assert client.post(f"/api/assets/{asset['id']}/entries", headers=user_headers, json={}).status_code == 422
    assert client.post(f"/api/assets/{asset['id']}/entries", headers=user_headers, json={"status": "Active"}).status_code == 400

    r = client.post(f"/api/assets/{asset['id']}/entries", headers=user_headers, json={"text": "Позвонил клиенту"})
    assert r.status_code == 200 and r.json()["kind"] == "comment" and r.json()["author_name"] == "Работник"
    r = client.post(f"/api/assets/{asset['id']}/entries", headers=admin_headers, json={"status": "On Hold", "text": "Ждём вендора"})
    assert r.json()["kind"] == "status" and r.json()["old_status"] == "Active" and r.json()["new_status"] == "On Hold"

    client.put(f"/api/assets/{asset['id']}", headers=user_headers, json={"description": "Новое", "status": "Closed", "comment": "Решено"})

    entries = client.get(f"/api/assets/{asset['id']}/entries", headers=user_headers).json()
    assert [e["kind"] for e in entries] == ["edit", "status", "status", "comment", "created"]
    assert entries[0]["text"] == "Изменено: описание"
    assert entries[1]["text"] == "Решено" and entries[1]["new_status"] == "Closed"

    listed = client.get("/api/assets/", headers=user_headers).json()[0]
    assert listed["last_entry"]["kind"] == "edit"

    client.delete(f"/api/assets/{asset['id']}", headers=admin_headers)
    assert client.get(f"/api/assets/{asset['id']}/entries", headers=user_headers).status_code == 404


def test_handover_with_updates(client, admin_headers, user_headers):
    a1 = client.post("/api/assets/", headers=user_headers, json={"title": "A1", "description": "d", "asset_type": "CASE"}).json()
    a2 = client.post("/api/assets/", headers=user_headers, json={"title": "A2", "description": "d", "asset_type": "CASE"}).json()

    response = client.post("/api/handovers/", headers=user_headers, json={
        "handover_notes": "Смена спокойная",
        "asset_ids": [a1["id"]],
        "updates": [
            {"asset_id": a1["id"], "text": "Ждём ответа клиента"},
            {"asset_id": a2["id"], "status": "Closed", "text": "Закрыли"},
            {"asset_id": a1["id"]},  # пустое обновление игнорируется
        ],
    })
    assert response.status_code == 200, response.text
    handover = response.json()
    assert sorted(a["id"] for a in handover["assets"]) == sorted([a1["id"], a2["id"]])
    assert [(e["asset_id"], e["kind"]) for e in handover["entries"]] == [(a1["id"], "comment"), (a2["id"], "status")]
    assert client.get(f"/api/assets/{a2['id']}", headers=user_headers).json()["status"] == "Closed"

    # Ошибка в одном обновлении откатывает всю передачу
    bad = client.post("/api/handovers/", headers=user_headers, json={
        "handover_notes": "x", "updates": [{"asset_id": a1["id"], "status": "Closed"}, {"asset_id": a2["id"], "status": "Nope"}],
    })
    assert bad.status_code == 400
    assert client.get(f"/api/assets/{a1['id']}", headers=user_headers).json()["status"] == "Active"
    assert len(client.get("/api/handovers/", headers=user_headers).json()) == 1

    exported = client.get("/api/handovers/export", headers=user_headers).json()["data"][0]
    assert "A2 (CASE, Закрыт): Закрыли" in exported["assets_info"]

    # После удаления передачи записи остаются в истории актива
    assert client.delete(f"/api/handovers/{handover['id']}", headers=user_headers).status_code == 403
    client.delete(f"/api/handovers/{handover['id']}", headers=admin_headers)
    entries = client.get(f"/api/assets/{a2['id']}/entries", headers=user_headers).json()
    assert entries[0]["text"] == "Закрыли" and entries[0]["handover_id"] is None


# --- Миграция старой БД -------------------------------------------------------

def test_legacy_database_is_migrated(tmp_path):
    """Старая БД (без custom_fields и справочников) должна подхватываться без потери данных."""
    from app.db.init_db import create_tables
    from app.db.migrations import run_migrations
    from app.db.session import build_engine
    from sqlalchemy.orm import sessionmaker

    db_file = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_file)
    conn.execute(
        "CREATE TABLE assets (id INTEGER PRIMARY KEY, title VARCHAR NOT NULL, description TEXT NOT NULL, "
        "asset_type VARCHAR NOT NULL, status VARCHAR NOT NULL, created_at DATETIME, updated_at DATETIME)"
    )
    conn.execute("INSERT INTO assets (title, description, asset_type, status) VALUES ('Old', 'd', 'CASE', 'Active')")
    conn.execute("INSERT INTO assets (title, description, asset_type, status) VALUES ('Odd', 'd', 'LEGACY_TYPE', 'Weird')")
    conn.commit()
    conn.close()

    engine = build_engine(f"sqlite:///{db_file.as_posix()}")
    create_tables(engine)
    session = sessionmaker(bind=engine)()
    run_migrations(engine, session)
    run_migrations(engine, session)  # повторный запуск безопасен

    from app.models import Asset, AssetCategory, AssetStatusOption
    assert session.query(Asset).count() == 2
    assert {c.key for c in session.query(AssetCategory)} >= {"CASE", "LEGACY_TYPE"}
    assert session.query(AssetCategory).count() == 5
    assert {s.key for s in session.query(AssetStatusOption)} >= {"Active", "Weird"}
    assert session.query(Asset).first().custom_fields is None
    session.close()
    engine.dispose()


def test_login_still_works_after_settings(client):
    login(client, "Sideffect", "admin123")
