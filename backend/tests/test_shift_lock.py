"""Начавшиеся и прошедшие смены (факт отработки) может менять только администратор."""
import pytest

PAST = {"date": "2026-01-04", "start_time": "09:00", "end_time": "21:00", "shift_type": "day"}
TODAY_STARTED = {"date": "2026-01-05", "start_time": "09:00", "end_time": "21:00", "shift_type": "day"}
FUTURE = {"date": "2026-01-05", "start_time": "21:00", "end_time": "09:00", "shift_type": "night"}


@pytest.fixture()
def ids(client, admin_headers, user_headers):
    admin = client.get("/api/me", headers=admin_headers).json()["id"]
    worker = client.get("/api/me", headers=user_headers).json()["id"]
    return admin, worker


def create(client, headers, payload, user_id):
    return client.post("/api/shifts/", headers=headers, json={**payload, "user_id": user_id})


def test_worker_cannot_touch_started_shifts(client, admin_headers, user_headers, ids):
    admin, worker = ids
    # «Сейчас» в тестах — 5 января 2026, 12:00: дневная смена 5-го уже идёт, ночная — впереди
    for payload in (PAST, TODAY_STARTED):
        response = create(client, user_headers, payload, worker)
        assert response.status_code == 403
        assert "только администратор" in response.json()["detail"]
    assert client.post("/api/shifts/bulk", headers=user_headers, json={"shifts": [
        {**FUTURE, "user_id": worker}, {**PAST, "user_id": worker},
    ]}).status_code == 403
    assert client.get("/api/shifts/", headers=admin_headers).json() == []

    past = create(client, admin_headers, PAST, admin).json()
    future = create(client, user_headers, FUTURE, worker).json()

    assert client.put(f"/api/shifts/{past['id']}", headers=user_headers, json={**PAST, "user_id": worker}).status_code == 403
    assert client.post(f"/api/shifts/{past['id']}/assign", headers=user_headers, json={"user_id": worker}).status_code == 403
    assert client.put(f"/api/shifts/{past['id']}/split", headers=user_headers, json={"parts": []}).status_code == 403
    assert client.post("/api/shifts/swap", headers=user_headers, json={"shift_ids": [past["id"], future["id"]]}).status_code == 403
    assert client.delete(f"/api/shifts/{past['id']}", headers=user_headers).status_code == 403
    # Будущую смену нельзя перенести в прошлое
    assert client.put(f"/api/shifts/{future['id']}", headers=user_headers, json={**PAST, "user_id": worker}).status_code == 403
    # Ничего не изменилось
    assert client.get(f"/api/shifts/{past['id']}", headers=user_headers).json()["user_id"] == admin

    # Будущие смены сотрудник по-прежнему правит сам
    assert client.post(f"/api/shifts/{future['id']}/assign", headers=user_headers, json={"user_id": admin}).status_code == 200
    assert client.delete(f"/api/shifts/{future['id']}", headers=user_headers).status_code == 200


def test_admin_edits_started_shifts(client, admin_headers, ids):
    admin, worker = ids
    past = create(client, admin_headers, PAST, admin)
    assert past.status_code == 200, past.text
    shift = past.json()
    assert client.post(f"/api/shifts/{shift['id']}/assign", headers=admin_headers, json={"user_id": worker}).json()["user_id"] == worker
    split = client.put(f"/api/shifts/{shift['id']}/split", headers=admin_headers, json={"parts": [
        {"user_id": worker, "start_at": "2026-01-04T09:00"}, {"user_id": admin, "start_at": "2026-01-04T15:00"},
    ]})
    assert split.status_code == 200, split.text
    assert client.delete(f"/api/shifts/{shift['id']}", headers=admin_headers).status_code == 200


def test_generator_leaves_started_shifts_to_admin(client, admin_headers, user_headers):
    users = client.get("/api/users/", headers=admin_headers).json()
    for index in range(2):
        client.post("/api/users/", headers=admin_headers, json={
            "username": f"extra{index}", "password": "secret12", "name": f"Сотрудник {index}", "position": "Инженер",
        })
    ids = [u["id"] for u in client.get("/api/users/", headers=admin_headers).json()][:4]
    assert len(ids) == 4 and users
    kept = create(client, admin_headers, PAST, ids[0]).json()
    params = {"date_from": "2026-01-04", "date_to": "2026-01-06", "user_ids": ids, "mode": "replace", "preview": False}

    result = client.post("/api/shifts/generate", headers=user_headers, json=params).json()
    # 4-е и дневная 5-го уже начались: из шести слотов сотрудник заполнил только три будущих
    assert result["created"] == 3
    assert any("только администратор" in w for w in result["warnings"])
    assert client.get(f"/api/shifts/{kept['id']}", headers=user_headers).status_code == 200

    admin_result = client.post("/api/shifts/generate", headers=admin_headers, json=params).json()
    assert admin_result["created"] == 6 and admin_result["removed"] == 4
