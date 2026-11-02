"""Фильтры списка кейсов: период обновления, автор записей, сортировка, поиск по истории."""
from datetime import date, timedelta

from tests.conftest import login  # noqa: F401 — фикстуры из conftest


def make(client, headers, title, asset_type="CASE"):
    response = client.post("/api/assets/", headers=headers, json={"title": title, "description": "описание", "asset_type": asset_type})
    assert response.status_code == 200, response.text
    return response.json()


def titles(client, headers, **params):
    return [a["title"] for a in client.get("/api/assets/", headers=headers, params=params).json()]


def test_sorting(client, admin_headers):
    for title in ("Бета", "альфа", "Гамма"):
        make(client, admin_headers, title)
    assert titles(client, admin_headers, sort="title") == ["альфа", "Бета", "Гамма"]
    assert titles(client, admin_headers, sort="created_asc") == ["Бета", "альфа", "Гамма"]
    assert titles(client, admin_headers, sort="created_desc") == ["Гамма", "альфа", "Бета"]
    assert client.get("/api/assets/", headers=admin_headers, params={"sort": "nope"}).status_code == 422


def test_author_filter_and_history_search(client, admin_headers, user_headers):
    worker = client.get("/api/me", headers=user_headers).json()
    mine = make(client, user_headers, "Кейс сотрудника")
    other = make(client, admin_headers, "Кейс админа")
    # Сотрудник оставил запись и в чужом кейсе — он тоже «его»
    client.post(f"/api/assets/{other['id']}/entries", headers=user_headers, json={"text": "Перезагрузили модем на судне"})

    assert set(titles(client, admin_headers, author_id=worker["id"])) == {mine["title"], other["title"]}
    admin = client.get("/api/me", headers=admin_headers).json()
    assert titles(client, admin_headers, author_id=admin["id"]) == [other["title"]]

    # Поиск находит кейс по тексту из истории, без учёта регистра
    assert titles(client, admin_headers, search="МОДЕМ") == [other["title"]]


def test_updated_period(client, admin_headers):
    make(client, admin_headers, "Свежий")
    today = date.today()
    assert titles(client, admin_headers, updated_from=(today - timedelta(days=1)).isoformat()) == ["Свежий"]
    assert titles(client, admin_headers, updated_to=(today - timedelta(days=2)).isoformat()) == []
    assert titles(client, admin_headers, updated_from=(today + timedelta(days=2)).isoformat()) == []


def test_sort_by_case_number(client, user_headers):
    """Номер берётся из «CASE#…» или из числа в названии; кейсы без номера — в конце при любом направлении."""
    for title in ("CASE#1750882 Arctic", "392923 Gustav", "CASE#100 Alpha", "Без номера"):
        response = client.post("/api/assets/", headers=user_headers, json={
            "title": title, "description": "проверка", "asset_type": "CASE",
        })
        assert response.status_code == 200, response.text

    def titles(sort):
        return [a["title"] for a in client.get("/api/assets/", headers=user_headers, params={"sort": sort}).json()]

    assert titles("number_desc") == ["CASE#1750882 Arctic", "392923 Gustav", "CASE#100 Alpha", "Без номера"]
    assert titles("number_asc") == ["CASE#100 Alpha", "392923 Gustav", "CASE#1750882 Arctic", "Без номера"]
