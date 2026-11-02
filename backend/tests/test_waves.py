"""Две волны передачи смен: 1 — сменные день/ночь, 2 — дневные «2 через 2». Передачи видят все."""


def add_user(client, admin_headers, username, name, wave=None):
    payload = {"username": username, "password": "secret12", "name": name, "position": "Инженер"}
    if wave:
        payload["wave"] = wave
    response = client.post("/api/users/", headers=admin_headers, json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def add_shift(client, headers, user_id, date="2026-11-03"):
    response = client.post("/api/shifts/", headers=headers, json={
        "date": date, "start_time": "09:00", "end_time": "21:00", "shift_type": "day", "user_id": user_id,
    })
    assert response.status_code == 200, response.text
    return response.json()


def handover(client, headers, **payload):
    response = client.post("/api/handovers/", headers=headers, json={"handover_notes": "итог дня", **payload})
    assert response.status_code == 200, response.text
    return response.json()


def test_wave_of_users_and_handovers(client, admin_headers, user_headers):
    alex = add_user(client, admin_headers, "alex", "Александр Антоненко", wave=2)
    vova = add_user(client, admin_headers, "vova", "Владимир Борисенко", wave=2)
    worker = next(u for u in client.get("/api/users/public", headers=user_headers).json() if u["name"] == "Работник")
    assert (alex["wave"], worker["wave"]) == (2, 1)  # по умолчанию — 1 волна
    # Волну видят все (нужно для подбора смен), меняет администратор
    assert client.put(f"/api/users/{worker['id']}", headers=admin_headers, json={
        "name": "Работник", "position": "Инженер", "is_admin": False,
    }).json()["wave"] == 1  # старый клиент без поля — волна не сбрасывается и не меняется

    # Двое на одной дневной смене: у передачи волна — по сотруднику сдающей смены
    alex_day = add_shift(client, admin_headers, alex["id"], "2026-11-03")
    vova_day = add_shift(client, admin_headers, vova["id"], "2026-11-05")
    worker_day = add_shift(client, admin_headers, worker["id"], "2026-11-03")
    second = handover(client, user_headers, from_shift_id=alex_day["id"], to_shift_id=vova_day["id"])
    first = handover(client, user_headers, from_shift_id=worker_day["id"])
    assert (second["wave"], first["wave"]) == (2, 1)
    # Без смены — по автору; явно указанная волна важнее
    assert handover(client, user_headers)["wave"] == 1
    assert handover(client, user_headers, wave=2)["wave"] == 2

    # Журнал: все передачи видны всем, фильтр по волне
    everything = client.get("/api/handovers/", headers=user_headers)
    assert everything.headers["X-Total-Count"] == "4"
    only_second = client.get("/api/handovers/", headers=user_headers, params={"wave": 2})
    assert only_second.headers["X-Total-Count"] == "2"
    assert {h["wave"] for h in only_second.json()} == {2}

    # Правка передачи без поля wave волну не меняет
    edited = client.put(f"/api/handovers/{second['id']}", headers=user_headers, json={"handover_notes": "уточнение"})
    assert edited.json()["wave"] == 2


def test_second_wave_is_left_out_of_excel_journal(client, admin_headers, user_headers):
    """Журнал Excel — только 1 волна: строки 2 волны не загружаются, её передачи и записи не выгружаются."""
    import io

    from openpyxl import load_workbook

    from tests.test_exchange import HEADERS, make_workbook, upload

    vova = add_user(client, admin_headers, "vova", "Владимир Борисенко", wave=2)
    rows = [
        ["18.10.2026 09:00 -\n18.10.2026 21:00", "Борисенко", "1) Open CASE#200 Bravo - окно работ", None, "", "", ""],
        ["18.10.2026 09:00 -\n18.10.2026 21:00", "Работник", "1) Open CASE#100 Alpha - ждём", None, "", "", ""],
    ]
    content = make_workbook(rows=rows, headers=HEADERS)
    preview = upload(client, admin_headers, "/api/exchange/import/preview", content).json()
    assert [r["error"] for r in preview["rows"]] == ["2 волна — в журнал Excel не входит", None]

    result = upload(client, admin_headers, "/api/exchange/import", content).json()
    assert (result["handovers"], result["second_wave_skipped"], result["errors"]) == (1, 1, [])
    assert [h["wave"] for h in client.get("/api/handovers/", headers=user_headers).json()] == [1]
    titles = {a["title"] for a in client.get("/api/assets/", headers=user_headers, params={"include_closed": True}).json()}
    assert titles == {"CASE#100 Alpha"}

    # Передача 2 волны на сайте с записью по кейсу — в выгрузке ни её, ни автора
    vova_headers = client.post("/api/token", data={"username": "vova", "password": "secret12"}).json()["access_token"]
    vova_headers = {"Authorization": f"Bearer {vova_headers}"}
    vova_headers = {"Authorization": "Bearer " + client.post("/api/profile/password", headers=vova_headers, json={
        "current_password": "secret12", "new_password": "vova-own-pass"}).json()["access_token"]}
    alpha = next(iter(client.get("/api/assets/", headers=user_headers).json()))
    second = handover(client, vova_headers, asset_ids=[alpha["id"]],
                      updates=[{"asset_id": alpha["id"], "text": "секретная запись 2 волны"}])
    assert second["wave"] == 2

    ws_book = load_workbook(io.BytesIO(client.get("/api/exchange/export.xlsx", headers=user_headers).content))
    dump = "\n".join(str(cell.value) for ws in ws_book.worksheets for row in ws.iter_rows() for cell in row if cell.value)
    assert vova["name"] not in dump and "Борисенко" not in dump
    assert "секретная запись 2 волны" not in dump
    assert str(second["id"]) not in [str(c.value) for c in ws_book["Передачи"]["G"]]
