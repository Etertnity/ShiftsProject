"""Профили и сброс пароля, автограф и отработка смен, ICMP-монитор."""
from datetime import datetime

import pytest

from app.services import zabbix as zabbix_module
from tests.conftest import WORKER_OWN_PASSWORD, login


def me(client, headers):
    return client.get("/api/me", headers=headers).json()


def add_user(client, admin_headers, username, name):
    response = client.post("/api/users/", headers=admin_headers, json={
        "username": username, "password": "secret12", "name": name, "position": "Инженер",
    })
    assert response.status_code == 200, response.text
    return response.json()


# --- Профиль и доступ к данным сотрудников --------------------------------------

def test_logins_are_hidden_from_everyone_but_owner(client, admin_headers, user_headers):
    worker = me(client, user_headers)
    assert worker["username"] == "worker"  # свой логин виден

    admin_list = client.get("/api/users/", headers=admin_headers).json()
    assert all("username" not in u and "hashed_password" not in u for u in admin_list)
    assert any(u["phone"] is None or "phone" in u for u in admin_list)  # контакты админу видны

    public = client.get("/api/users/public", headers=user_headers).json()
    assert set(public[0]) == {"id", "name", "position", "is_active", "phone", "telegram_id", "email"}  # без логина
    assert client.get(f"/api/users/{worker['id']}", headers=user_headers).status_code == 403


def test_colleagues_see_only_allowed_contacts(client, admin_headers, user_headers):
    contacts = {"phone": "+7 999 000-00-00", "telegram_id": "admin_tg", "email": "admin@example.com"}
    admin = me(client, admin_headers)
    profile = {"name": admin["name"], "position": admin["position"], **contacts}
    assert client.put("/api/profile", headers=admin_headers, json=profile).status_code == 200

    def admin_seen_by_worker():
        return next(u for u in client.get("/api/users/public", headers=user_headers).json() if u["id"] == admin["id"])

    # По умолчанию: телефон скрыт, Telegram и почта видны
    seen = admin_seen_by_worker()
    assert seen["phone"] is None and seen["telegram_id"] == "admin_tg" and seen["email"] == "admin@example.com"

    response = client.put("/api/profile", headers=admin_headers, json={**profile, "show_phone": True, "show_email": False})
    assert response.json()["show_phone"] is True and response.json()["show_email"] is False
    seen = admin_seen_by_worker()
    assert seen["phone"] == contacts["phone"] and seen["email"] is None

    # Профиль без флагов (старый клиент) не сбрасывает настройки видимости
    client.put("/api/profile", headers=admin_headers, json=profile)
    assert me(client, admin_headers)["show_phone"] is True

    # Свои контакты и контакты для администратора — без фильтра
    worker = me(client, user_headers)
    client.put("/api/profile", headers=user_headers, json={
        "name": worker["name"], "position": worker["position"], "phone": "+7 111", "show_phone": False,
    })
    own = next(u for u in client.get("/api/users/public", headers=user_headers).json() if u["id"] == worker["id"])
    by_admin = next(u for u in client.get("/api/users/public", headers=admin_headers).json() if u["id"] == worker["id"])
    assert own["phone"] == "+7 111" and by_admin["phone"] == "+7 111"


def test_new_user_must_change_password(client, admin_headers):
    add_user(client, admin_headers, "newbie", "Новичок")
    headers = login(client, "newbie", "secret12")
    assert me(client, headers)["must_change_password"] is True
    # С временным паролем API закрыто на сервере, а не только в интерфейсе
    assert client.get("/api/shifts/", headers=headers).status_code == 403
    assert client.get("/api/assets/", headers=headers).status_code == 403

    assert client.post("/api/profile/password", headers=headers, json={
        "current_password": "wrong", "new_password": "newsecret",
    }).status_code == 400
    assert client.post("/api/profile/password", headers=headers, json={
        "current_password": "secret12", "new_password": "secret12",
    }).status_code == 400
    assert client.post("/api/profile/password", headers=headers, json={
        "current_password": "secret12", "new_password": "short",
    }).status_code == 422
    response = client.post("/api/profile/password", headers=headers, json={
        "current_password": "secret12", "new_password": "newsecret",
    })
    assert response.status_code == 200
    # Старый токен закрыт, новый — из ответа
    assert client.get("/api/me", headers=headers).status_code == 401
    new_headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert me(client, new_headers)["must_change_password"] is False
    assert client.get("/api/assets/", headers=new_headers).status_code == 200
    login(client, "newbie", "newsecret")


def test_admin_resets_password_and_login(client, admin_headers, user_headers):
    worker = me(client, user_headers)
    response = client.post(f"/api/users/{worker['id']}/reset-password", headers=admin_headers)
    assert response.status_code == 200
    temporary = response.json()["temporary_password"]
    assert len(temporary) == 10

    # Старый пароль больше не подходит, временный — подходит и требует смены
    assert client.post("/api/token", data={"username": "worker", "password": WORKER_OWN_PASSWORD}).status_code == 401
    # Сброс закрыл все открытые сессии сотрудника
    assert client.get("/api/me", headers=user_headers).status_code == 401
    headers = login(client, "worker", temporary)
    assert me(client, headers)["must_change_password"] is True

    # Администратор задаёт новый логин, не видя старого
    response = client.put(f"/api/users/{worker['id']}", headers=admin_headers, json={
        "username": "worker2", "name": "Работник", "position": "Инженер",
    })
    assert response.status_code == 200 and "username" not in response.json()
    login(client, "worker2", temporary)

    # Пустой логин — оставить как есть
    client.put(f"/api/users/{worker['id']}", headers=admin_headers, json={"username": "", "name": "Р", "position": "И"})
    new_headers = login(client, "worker2", temporary)

    # Смена логина завершает старые сессии (токен выдан на прежний логин)
    assert client.get("/api/me", headers=headers).status_code == 401
    assert client.post(f"/api/users/{worker['id']}/reset-password", headers=new_headers).status_code == 403


# --- Смены: замена, обмен, разделение -------------------------------------------

def make_shift(client, headers, user_id, date="2026-10-17", shift_type="day"):
    times = ("09:00", "21:00") if shift_type == "day" else ("21:00", "09:00")
    response = client.post("/api/shifts/", headers=headers, json={
        "date": date, "start_time": times[0], "end_time": times[1], "shift_type": shift_type, "user_id": user_id,
    })
    assert response.status_code == 200, response.text
    return response.json()


def test_assign_swap_and_split(client, admin_headers, user_headers):
    admin = me(client, admin_headers)
    worker = me(client, user_headers)
    kolya = add_user(client, admin_headers, "kolya", "Коля")

    day = make_shift(client, user_headers, admin["id"])
    night = make_shift(client, user_headers, worker["id"], shift_type="night")

    # Замена дежурного
    response = client.post(f"/api/shifts/{day['id']}/assign", headers=user_headers, json={"user_id": kolya["id"]})
    assert response.json()["user_name"] == "Коля"

    # Рокировка двух смен
    swapped = client.post("/api/shifts/swap", headers=user_headers, json={"shift_ids": [day["id"], night["id"]]}).json()
    assert [s["user_name"] for s in swapped] == ["Работник", "Коля"]

    # Разделение ночной смены: Коля до 03:00, дальше Тимофей — время переходит через полночь
    response = client.put(f"/api/shifts/{night['id']}/split", headers=user_headers, json={"parts": [
        {"user_id": kolya["id"], "start_at": "2026-10-17T21:00"},
        {"user_id": admin["id"], "start_at": "2026-10-18T03:00"},
    ]})
    assert response.status_code == 200, response.text
    segments = response.json()["segments"]
    assert [(s["user_name"], s["start_at"], s["end_at"]) for s in segments] == [
        ("Коля", "2026-10-17T21:00", "2026-10-18T03:00"),
        ("Тимофей", "2026-10-18T03:00", "2026-10-18T09:00"),
    ]

    bad_parts = [
        [{"user_id": kolya["id"], "start_at": "2026-10-17T22:00"}, {"user_id": admin["id"], "start_at": "2026-10-18T03:00"}],
        [{"user_id": kolya["id"], "start_at": "2026-10-17T21:00"}, {"user_id": admin["id"], "start_at": "2026-10-18T10:00"}],
        [{"user_id": kolya["id"], "start_at": "2026-10-17T21:00"}, {"user_id": kolya["id"], "start_at": "2026-10-18T01:00"}],
    ]
    for parts in bad_parts:
        assert client.put(f"/api/shifts/{night['id']}/split", headers=user_headers, json={"parts": parts}).status_code == 400

    # Смена сотрудника через обычное редактирование сбрасывает разделение
    payload = {"date": "2026-10-17", "start_time": "21:00", "end_time": "09:00", "shift_type": "night", "user_id": worker["id"]}
    assert client.put(f"/api/shifts/{night['id']}", headers=user_headers, json=payload).json()["segments"] == []


def test_generate_rotation(client, admin_headers, user_headers):
    ids = [me(client, admin_headers)["id"], me(client, user_headers)["id"]]
    ids += [add_user(client, admin_headers, f"u{i}", f"Сотрудник {i}")["id"] for i in range(2)]

    params = {"date_from": "2026-11-01", "date_to": "2026-11-08", "user_ids": ids}
    preview = client.post("/api/shifts/generate", headers=user_headers, json=params).json()
    assert preview["created"] == 0 and len(preview["shifts"]) == 16
    assert client.get("/api/shifts/", headers=user_headers, params={"date_from": "2026-11-01"}).json() == []

    # Цикл одного сотрудника: день 1-го, ночь 2-го, выходные 3-го и 4-го, снова день 5-го
    first = [(s["date"], s["shift_type"]) for s in preview["shifts"] if s["user_id"] == ids[0]]
    assert first == [("2026-11-01", "day"), ("2026-11-02", "night"), ("2026-11-05", "day"), ("2026-11-06", "night")]
    # В каждый день ровно одна дневная и одна ночная
    for day in range(1, 9):
        key = f"2026-11-{day:02d}"
        assert sorted(s["shift_type"] for s in preview["shifts"] if s["date"] == key) == ["day", "night"]

    client.post("/api/shifts/", headers=user_headers, json={
        "date": "2026-11-03", "start_time": "09:00", "end_time": "21:00", "shift_type": "day", "user_id": ids[1],
    })
    result = client.post("/api/shifts/generate", headers=user_headers, json={**params, "preview": False}).json()
    assert result["created"] == 15 and result["skipped"] == 1
    assert len(client.get("/api/shifts/", headers=user_headers, params={"date_from": "2026-11-01"}).json()) == 16

    replaced = client.post("/api/shifts/generate", headers=user_headers, json={**params, "mode": "replace", "preview": False}).json()
    assert replaced["removed"] == 16 and replaced["created"] == 16

    assert client.post("/api/shifts/generate", headers=user_headers, json={**params, "user_ids": ids[:2]}).status_code == 422
    three = client.post("/api/shifts/generate", headers=user_headers, json={**params, "user_ids": ids[:3]}).json()
    assert three["warnings"]


def test_stats_counts_full_and_partial_hours(client, admin_headers, user_headers, monkeypatch):
    admin = me(client, admin_headers)
    worker = me(client, user_headers)
    full = make_shift(client, user_headers, admin["id"], date="2026-10-10")
    split = make_shift(client, user_headers, admin["id"], date="2026-10-11")
    make_shift(client, user_headers, worker["id"], date="2026-10-30")  # ещё не наступила
    client.put(f"/api/shifts/{split['id']}/split", headers=user_headers, json={"parts": [
        {"user_id": admin["id"], "start_at": "2026-10-11T09:00"},
        {"user_id": worker["id"], "start_at": "2026-10-11T15:00"},
    ]})
    assert full

    from app.services import schedule
    monkeypatch.setattr(schedule, "now_local", lambda: datetime(2026, 10, 20, 12, 0))
    data = client.get("/api/shifts/stats", headers=user_headers, params={"date_from": "2026-10-01", "date_to": "2026-10-31"}).json()
    rows = {row["name"]: row for row in data["items"]}
    assert rows["Тимофей"]["worked_shifts"] == 2 and rows["Тимофей"]["worked_hours"] == 18
    assert rows["Тимофей"]["partial_shifts"] == 1
    assert rows["Работник"]["worked_hours"] == 6 and rows["Работник"]["planned_hours"] == 18
    assert rows["Работник"]["planned_shifts"] == 2 and rows["Работник"]["worked_shifts"] == 1


# --- ICMP-монитор ---------------------------------------------------------------

def test_vessels_seeded_and_managed(client, admin_headers, user_headers):
    vessels = client.get("/api/monitoring/vessels", headers=user_headers).json()
    assert len(vessels) == 99 and vessels[0]["name"] == "Omsk"

    url = "http://zabbix/history.php?action=showgraph&itemids%5B%5D=99999&from=now-12h"
    created = client.post("/api/monitoring/vessels", headers=user_headers, json={"name": "Test", "item": url})
    assert created.status_code == 200 and created.json()["item_id"] == "99999"
    assert client.post("/api/monitoring/vessels", headers=user_headers, json={"name": "Dup", "item": "99999"}).status_code == 400
    assert client.post("/api/monitoring/vessels", headers=user_headers, json={"name": "Bad", "item": "abc"}).status_code == 400

    vessel_id = created.json()["id"]
    hidden = client.put(f"/api/monitoring/vessels/{vessel_id}", headers=user_headers, json={"is_hidden": True}).json()
    assert hidden["is_hidden"] is True
    assert client.delete(f"/api/monitoring/vessels/{vessel_id}", headers=user_headers).status_code == 403
    assert client.delete(f"/api/monitoring/vessels/{vessel_id}", headers=admin_headers).status_code == 200


def test_history_requires_config_and_known_item(client, user_headers, monkeypatch):
    assert client.get("/api/monitoring/config", headers=user_headers).json()["configured"] is False
    # Неизвестный item нельзя запросить, даже если Zabbix настроен
    assert client.get("/api/monitoring/history/1", headers=user_headers, params={"hours": 12}).status_code == 404
    assert client.get("/api/monitoring/history/54357", headers=user_headers, params={"hours": 12}).status_code == 503


@pytest.fixture()
def fake_zabbix(monkeypatch):
    calls = []

    async def fake_rpc(self, method, params, auth):
        calls.append(method)
        if method == "user.login":
            return "token-1"
        # 3000 точек раз в 10 секунд, по убыванию времени (как отдаёт Zabbix при DESC)
        base = params["time_from"]
        return [{"clock": str(base + i * 10), "value": str(i % 100)} for i in range(2999, -1, -1)]

    from app.core.config import settings
    monkeypatch.setattr(type(settings), "zabbix_configured", property(lambda self: True))
    monkeypatch.setattr(zabbix_module.ZabbixClient, "_rpc", fake_rpc)
    monkeypatch.setattr(zabbix_module, "zabbix", zabbix_module.ZabbixClient())
    from app.api.routes import monitoring
    monkeypatch.setattr(monitoring, "zabbix", zabbix_module.zabbix)
    return calls


def test_history_is_downsampled_and_cached(client, user_headers, fake_zabbix):
    response = client.get("/api/monitoring/history/54357", headers=user_headers, params={"hours": 12})
    assert response.status_code == 200, response.text
    points = response.json()["points"]
    assert len(points) == zabbix_module.MAX_POINTS
    assert points == sorted(points)  # по возрастанию времени
    assert max(p[1] for p in points) == 99  # пики не потерялись

    client.get("/api/monitoring/history/54357", headers=user_headers, params={"hours": 12})
    assert fake_zabbix.count("history.get") == 1  # второй запрос — из кэша
    assert fake_zabbix.count("user.login") == 1

    since = client.get("/api/monitoring/history/54357", headers=user_headers, params={"since": 1})
    assert since.status_code == 200 and len(since.json()["points"]) == 3000
    assert client.get("/api/monitoring/history/54357", headers=user_headers, params={"hours": 5}).status_code == 400


def test_parse_item_id():
    parse = zabbix_module.parse_item_id
    assert parse("12345") == "12345"
    assert parse("http://x/history.php?action=showgraph&itemids%5B%5D=555&from=now") == "555"
    assert parse("http://x/history.php?itemids[]=777") == "777"
    assert parse("nothing here") is None
