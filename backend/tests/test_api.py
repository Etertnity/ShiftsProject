from tests.conftest import WORKER_OWN_PASSWORD, login


def make_shift(client, headers, user_id, date="2026-10-19", shift_type="day"):
    times = ("09:00", "21:00") if shift_type == "day" else ("21:00", "09:00")
    response = client.post("/api/shifts/", headers=headers, json={
        "date": date, "start_time": times[0], "end_time": times[1], "shift_type": shift_type, "user_id": user_id,
    })
    assert response.status_code == 200, response.text
    return response.json()


def make_asset(client, headers, title="CASE-1", asset_type="CASE", status="Active"):
    response = client.post("/api/assets/", headers=headers, json={
        "title": title, "description": "Описание", "asset_type": asset_type, "status": status,
    })
    assert response.status_code == 200, response.text
    return response.json()


def me(client, headers):
    return client.get("/api/me", headers=headers).json()


# --- Авторизация ---------------------------------------------------------

def test_health(client):
    assert client.get("/").status_code == 200


def test_login_variants(client):
    assert client.post("/api/token", data={"username": "Sideffect", "password": "admin123"}).status_code == 200
    assert client.post("/token", data={"username": "Sideffect", "password": "admin123"}).status_code == 200
    assert client.post("/api/login", json={"username": "Sideffect", "password": "admin123"}).status_code == 200
    bad = client.post("/api/token", data={"username": "Sideffect", "password": "wrong"})
    assert bad.status_code == 401
    assert bad.json()["detail"] == "Неверный логин или пароль"


def test_dates_are_serialized_as_utc(client, admin_headers):
    assert me(client, admin_headers)["created_at"].endswith("Z")


def test_endpoints_require_auth(client):
    for method, path in [("get", "/api/shifts/"), ("post", "/api/shifts/"), ("delete", "/api/shifts/1"),
                         ("get", "/api/assets/"), ("get", "/api/handovers/"), ("get", "/api/users/public")]:
        assert getattr(client, method)(path).status_code == 401, path


def test_inactive_user_cannot_login(client, admin_headers, user_headers):
    worker = me(client, user_headers)
    response = client.put(f"/api/users/{worker['id']}", headers=admin_headers, json={
        "username": "worker", "name": "Работник", "position": "Инженер", "is_active": False,
    })
    assert response.status_code == 200, response.text
    assert client.post("/api/token", data={"username": "worker", "password": WORKER_OWN_PASSWORD}).status_code == 403
    # Отключение сразу закрывает уже открытые сессии
    assert client.get("/api/me", headers=user_headers).status_code == 401


# --- Сотрудники ----------------------------------------------------------

def test_non_admin_cannot_manage_users(client, user_headers):
    assert client.get("/api/users/", headers=user_headers).status_code == 403
    assert client.get("/api/users/public", headers=user_headers).status_code == 200
    assert client.post("/api/users/", headers=user_headers, json={
        "username": "x", "password": "secret12", "name": "x", "position": "x",
    }).status_code == 403


def test_user_update_keeps_password_when_empty(client, admin_headers, user_headers):
    worker = me(client, user_headers)
    response = client.put(f"/api/users/{worker['id']}", headers=admin_headers, json={
        "username": "worker", "password": "", "name": "Новое имя", "position": "Инженер", "phone": "",
    })
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Новое имя"
    assert response.json()["phone"] is None
    login(client, "worker", WORKER_OWN_PASSWORD)


def test_admin_cannot_lock_himself_out(client, admin_headers):
    admin = me(client, admin_headers)
    payload = {"username": admin["username"], "name": admin["name"], "position": admin["position"]}
    assert client.put(f"/api/users/{admin['id']}", headers=admin_headers,
                      json={**payload, "is_admin": False}).status_code == 400
    assert client.put(f"/api/users/{admin['id']}", headers=admin_headers,
                      json={**payload, "is_admin": True, "is_active": False}).status_code == 400
    assert client.delete(f"/api/users/{admin['id']}", headers=admin_headers).status_code == 400


def test_duplicate_username(client, admin_headers, user_headers):
    response = client.post("/api/users/", headers=admin_headers, json={
        "username": "worker", "password": "secret12", "name": "x", "position": "x",
    })
    assert response.status_code == 400


def test_profile_update(client, user_headers):
    response = client.put("/api/profile", headers=user_headers, json={
        "name": "Иван", "position": "L2", "telegram_id": "ivan",
    })
    assert response.status_code == 200
    assert response.json()["telegram_id"] == "ivan"


# --- Смены ---------------------------------------------------------------

def test_shift_crud_and_validation(client, admin_headers, user_headers):
    worker = me(client, user_headers)
    admin = me(client, admin_headers)
    shift = make_shift(client, user_headers, worker["id"])
    assert shift["user_name"] == "Работник"

    # Смена сотрудника — имя должно обновиться
    response = client.put(f"/api/shifts/{shift['id']}", headers=user_headers, json={
        "date": "2026-10-20", "start_time": "21:00", "end_time": "09:00", "shift_type": "night", "user_id": admin["id"],
    })
    assert response.status_code == 200
    assert response.json()["user_name"] == admin["name"]

    bad_payloads = [
        {"user_id": 0},
        {"user_id": 9999},
        {"start_time": "25:00"},
        {"date": "19.10.2026"},
        {"shift_type": "evening"},
    ]
    base = {"date": "2026-10-19", "start_time": "09:00", "end_time": "21:00", "shift_type": "day", "user_id": worker["id"]}
    for override in bad_payloads:
        assert client.post("/api/shifts/", headers=user_headers, json={**base, **override}).status_code in (404, 422), override

    assert client.delete(f"/api/shifts/{shift['id']}", headers=user_headers).status_code == 200
    assert client.get(f"/api/shifts/{shift['id']}", headers=user_headers).status_code == 404


def test_bulk_shifts_are_atomic(client, admin_headers, user_headers):
    worker = me(client, user_headers)
    base = {"date": "2026-10-19", "start_time": "09:00", "end_time": "21:00", "shift_type": "day"}
    response = client.post("/api/shifts/bulk", headers=user_headers, json={
        "shifts": [{**base, "user_id": worker["id"]}, {**base, "user_id": 9999}],
    })
    assert response.status_code == 404
    assert client.get("/api/shifts/", headers=user_headers).json() == []

    response = client.post("/api/shifts/bulk", headers=user_headers, json={
        "shifts": [{**base, "user_id": worker["id"]}, {**base, "user_id": me(client, admin_headers)["id"]}],
    })
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_shift_filters(client, user_headers):
    worker = me(client, user_headers)
    make_shift(client, user_headers, worker["id"], date="2026-10-01")
    make_shift(client, user_headers, worker["id"], date="2026-10-15")
    make_shift(client, user_headers, worker["id"], date="2026-11-01")
    shifts = client.get("/api/shifts/", headers=user_headers,
                        params={"date_from": "2026-10-01", "date_to": "2026-10-31"}).json()
    assert [s["date"] for s in shifts] == ["2026-10-15", "2026-10-01"]


# --- Активы --------------------------------------------------------------

def test_asset_crud_and_search(client, admin_headers, user_headers):
    asset = make_asset(client, user_headers, title="VPN падает")
    make_asset(client, user_headers, title="Другое", asset_type="ORANGE_CASE")

    assert len(client.get("/api/assets/", headers=user_headers, params={"search": "vpn"}).json()) == 1
    # Регистронезависимый поиск по кириллице (SQLite ILIKE так не умеет)
    assert len(client.get("/api/assets/", headers=user_headers, params={"search": "ПАДАЕТ"}).json()) == 1
    assert len(client.get("/api/assets/", headers=user_headers, params={"search": "описание"}).json()) == 2
    assert len(client.get("/api/assets/", headers=user_headers, params={"asset_type": "ORANGE_CASE"}).json()) == 1

    response = client.put(f"/api/assets/{asset['id']}", headers=user_headers, json={"status": "Closed"})
    assert response.status_code == 200
    assert response.json()["status"] == "Closed"
    assert response.json()["title"] == "VPN падает"

    assert client.put(f"/api/assets/{asset['id']}", headers=user_headers, json={"status": "Weird"}).status_code == 400
    # Удалять кейсы может только администратор — сотрудник не сотрёт историю
    assert client.delete(f"/api/assets/{asset['id']}", headers=user_headers).status_code == 403
    assert client.delete(f"/api/assets/{asset['id']}", headers=admin_headers).status_code == 200


# --- Передачи смен -------------------------------------------------------

def test_handover_flow(client, admin_headers, user_headers):
    worker = me(client, user_headers)
    day = make_shift(client, user_headers, worker["id"], shift_type="day")
    night = make_shift(client, user_headers, worker["id"], shift_type="night")
    a1 = make_asset(client, user_headers, title="A1")
    a2 = make_asset(client, user_headers, title="A2")

    response = client.post("/api/handovers/", headers=user_headers, json={
        "from_shift_id": day["id"], "to_shift_id": "", "handover_notes": "Наблюдения",
        "asset_ids": [a1["id"], a1["id"], a2["id"]],
    })
    assert response.status_code == 200, response.text
    handover = response.json()
    assert handover["to_shift_id"] is None
    assert [a["id"] for a in handover["assets"]] == [a1["id"], a2["id"]]

    response = client.put(f"/api/handovers/{handover['id']}", headers=user_headers, json={
        "from_shift_id": day["id"], "to_shift_id": night["id"], "handover_notes": "Обновлено", "asset_ids": [a2["id"]],
    })
    assert response.status_code == 200
    assert [a["id"] for a in response.json()["assets"]] == [a2["id"]]

    assert client.post("/api/handovers/", headers=user_headers, json={
        "handover_notes": "x", "asset_ids": [9999],
    }).status_code == 404

    # Удаление актива убирает его из передачи
    client.delete(f"/api/assets/{a2['id']}", headers=admin_headers)
    assert client.get(f"/api/handovers/{handover['id']}", headers=user_headers).json()["assets"] == []


def test_handover_export_and_clear(client, admin_headers, user_headers):
    # Раньше эти пути перехватывались /{handover_id} и отдавали 422
    empty = client.get("/api/handovers/export", headers=user_headers)
    assert empty.status_code == 200
    assert empty.json()["total"] == 0  # больше не создаётся фейковая тестовая запись

    worker = me(client, user_headers)
    day = make_shift(client, user_headers, worker["id"])
    client.post("/api/handovers/", headers=user_headers, json={
        "from_shift_id": day["id"], "handover_notes": "Смена прошла спокойно", "asset_ids": [],
    })
    exported = client.get("/api/handovers/export", headers=user_headers).json()
    assert exported["total"] == 1
    assert exported["data"][0]["from_shift_user"] == "Работник"
    assert exported["data"][0]["assets_info"] == "Нет активов"

    assert client.delete("/api/handovers/clear", headers=user_headers).status_code == 403
    cleared = client.delete("/api/handovers/clear", headers=admin_headers)
    assert cleared.status_code == 200
    assert cleared.json()["deleted_handovers"] == 1
    assert client.get("/api/handovers/", headers=user_headers).json() == []
