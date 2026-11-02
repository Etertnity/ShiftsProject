"""График смен в формате Excel-файла «График сменных»: табель, выгрузка и загрузка."""
import io
import json

from openpyxl import Workbook, load_workbook
from openpyxl.styles import PatternFill

GREEN = PatternFill("solid", fgColor="FF92D050")
RED = PatternFill("solid", fgColor="FFFF0000")
WEEKDAYS_NOV_2030 = ["Пт", "Сб", "Вс", "Пн", "Вт", "Ср", "Чт"]  # 1 ноября 2030 — пятница


def col(day, kind):
    """Колонка ячейки: E — день 1-го числа, F — ночь 1-го числа и т.д."""
    return 5 + (day - 1) * 2 + (1 if kind == "н" else 0)


def make_schedule(people):
    """Файл как лист «Общее»: год и месяц, «число», «день недели», «смена», затем строки сотрудников.
    people: [(подпись в колонке D, {(день, 'д'|'н'): (часы, заливка)})]"""
    wb = Workbook()
    ws = wb.active
    ws.title = "Общее"
    ws["D1"], ws["AI1"] = 2030, "Ноябрь"
    ws["D2"], ws["D3"], ws["D4"] = "число", "день недели", "смена"
    for day in range(1, 31):
        ws.cell(row=2, column=col(day, "д"), value=day)
        ws.cell(row=3, column=col(day, "д"), value=WEEKDAYS_NOV_2030[(day - 1) % 7])
        ws.cell(row=4, column=col(day, "д"), value="д")
        ws.cell(row=4, column=col(day, "н"), value="н")
    row = 6
    for label, cells in people:
        ws.cell(row=row, column=4, value=label)
        for (day, kind), (hours, fill) in cells.items():
            cell = ws.cell(row=row, column=col(day, kind), value=hours)
            if fill:
                cell.fill = fill
        ws.cell(row=row, column=67, value=f"=SUM(E{row}:BN{row})/12")
        row += 1
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def add_user(client, admin_headers, username, name):
    response = client.post("/api/users/", headers=admin_headers, json={
        "username": username, "password": "secret12", "name": name, "position": "Инженер",
    })
    assert response.status_code == 200, response.text
    return response.json()["id"]


def upload(client, headers, url, content, **data):
    return client.post(url, headers=headers, data=data or None,
                       files={"file": ("schedule.xlsx", content, "application/octet-stream")})


def shifts_of(client, headers, day):
    return client.get("/api/shifts/", headers=headers, params={"date": day}).json()


def test_import_reads_file_layout(client, admin_headers):
    ivan = add_user(client, admin_headers, "ivan", "Иван Петров")
    olga = add_user(client, admin_headers, "olga", "Ольга Смирнова")
    anna = add_user(client, admin_headers, "anna", "Анна Козлова")
    content = make_schedule([
        # Факт и план: берётся строка «отработано»; на 3-е число смена перенесена с дня на ночь
        ("Иван Петров отработано", {(1, "д"): (12, GREEN), (3, "н"): (12, GREEN), (5, "д"): (0, RED)}),
        ("Иван Петров станд.график", {(1, "д"): (12, None), (3, "д"): (12, None), (5, "д"): (12, None)}),
        # «Фамилия Имя» тоже находится; 12 + 12 днём 1-го — двое на смене одновременно
        ("Смирнова Ольга", {(1, "д"): (12, GREEN), (2, "н"): (4, GREEN), (7, "д"): (8, GREEN)}),
        ("Анна Козлова", {(2, "н"): (8, GREEN)}),
        ("Неизвестный Сотрудник", {(4, "д"): (12, GREEN)}),
        ("1", {(2, "н"): (4, GREEN)}),
    ])

    preview = upload(client, admin_headers, "/api/exchange/schedule/preview", content)
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["sheet"] == "Общее"
    assert [m["month"] for m in body["months"]] == ["2030-11"]
    assert body["months"][0]["new"] == 5
    assert body["unknown_people"] == ["Неизвестный Сотрудник"]
    assert any("без имени" in w for w in body["warnings"])

    result = upload(client, admin_headers, "/api/exchange/schedule/import", content)
    assert result.status_code == 200, result.text
    assert result.json()["created"] == 5

    first_day = shifts_of(client, admin_headers, "2030-11-01")
    assert sorted(s["user_id"] for s in first_day) == sorted([ivan, olga])
    assert all((s["start_time"], s["end_time"]) == ("09:00", "21:00") for s in first_day)

    # Ночь 2-го: 4 + 8 часов — одна смена на двоих по очереди
    night = shifts_of(client, admin_headers, "2030-11-02")
    assert len(night) == 1 and night[0]["shift_type"] == "night"
    assert [(p["user_id"], p["start_at"]) for p in night[0]["segments"]] == [
        (olga, "2030-11-02T21:00"), (anna, "2030-11-03T01:00"),
    ]

    third = shifts_of(client, admin_headers, "2030-11-03")
    assert [(s["shift_type"], s["user_id"]) for s in third] == [("night", ivan)]
    # Красная ячейка с 0 — смена не отработана, её не создаём
    assert shifts_of(client, admin_headers, "2030-11-05") == []
    # 8 часов одного человека — короткая смена
    short = shifts_of(client, admin_headers, "2030-11-07")
    assert [(s["start_time"], s["end_time"]) for s in short] == [("09:00", "17:00")]

    again = upload(client, admin_headers, "/api/exchange/schedule/preview", content).json()["months"][0]
    assert (again["new"], again["changed"], again["same"]) == (0, 0, 5)


def test_export_matches_layout_and_round_trips(client, admin_headers, user_headers):
    me = client.get("/api/me", headers=admin_headers).json()
    worker = next(u for u in client.get("/api/users/", headers=admin_headers).json() if u["name"] == "Работник")
    created = client.post("/api/shifts/bulk", headers=admin_headers, json={"shifts": [
        {"date": "2030-11-01", "start_time": "09:00", "end_time": "21:00", "shift_type": "day", "user_id": me["id"]},
        {"date": "2030-11-01", "start_time": "21:00", "end_time": "09:00", "shift_type": "night", "user_id": worker["id"]},
    ]}).json()
    split = client.put(f"/api/shifts/{created[1]['id']}/split", headers=admin_headers, json={"parts": [
        {"user_id": worker["id"], "start_at": "2030-11-01T21:00"},
        {"user_id": me["id"], "start_at": "2030-11-02T05:00"},
    ]})
    assert split.status_code == 200, split.text

    sheet = client.get("/api/shifts/timesheet", headers=user_headers, params={"month": "2030-11"})
    assert sheet.status_code == 200, sheet.text
    rows = {r["name"]: r for r in sheet.json()["rows"]}
    mine = rows[me["name"]]
    assert [(c["day"], c["kind"], c["hours"], c["status"]) for c in mine["worked"]] == [
        (1, "day", 12, "plan"), (1, "night", 4, "changed"),
    ]
    assert [(c["day"], c["kind"], c["hours"]) for c in mine["standard"]] == [(1, "day", 12)]
    assert sheet.json()["days"][0] == {"day": 1, "weekday": "Пт"}

    response = client.get("/api/exchange/schedule.xlsx", headers=user_headers, params={"month_from": "2030-11"})
    assert response.status_code == 200, response.text
    ws = load_workbook(io.BytesIO(response.content))["Общее"]
    assert (ws["D1"].value, ws["AI1"].value) == (2030, "Ноябрь")
    assert (ws["D2"].value, ws["E2"].value, ws["BO2"].value) == ("число", 1, "кол-во смен")
    assert (ws["D3"].value, ws["E3"].value) == ("день недели", "Пт")
    assert (ws["D4"].value, ws["E4"].value, ws["F4"].value) == ("смена", "д", "н")
    labels = [ws.cell(row=r, column=4).value for r in range(6, 12)]
    assert f"{me['name']} отработано" in labels and f"{worker['name']} станд.график" in labels
    my_row = labels.index(f"{me['name']} отработано") + 6
    assert (ws.cell(row=my_row, column=5).value, ws.cell(row=my_row, column=6).value) == (12, 4)
    assert ws.cell(row=my_row, column=67).value == f"=SUM(E{my_row}:BN{my_row})/12"

    # Тот же файл обратно — ничего не меняется
    preview = upload(client, admin_headers, "/api/exchange/schedule/preview", response.content).json()
    assert [(m["new"], m["changed"], m["same"]) for m in preview["months"]] == [(0, 0, 2)]


def test_fill_mode_keeps_existing_and_months_filter(client, admin_headers):
    ivan = add_user(client, admin_headers, "ivan", "Иван Петров")
    olga = add_user(client, admin_headers, "olga", "Ольга Смирнова")
    client.post("/api/shifts/", headers=admin_headers, json={
        "date": "2030-11-01", "start_time": "09:00", "end_time": "21:00", "shift_type": "day", "user_id": olga,
    })
    content = make_schedule([("Иван Петров", {(1, "д"): (12, GREEN), (2, "д"): (12, GREEN)})])

    skipped = upload(client, admin_headers, "/api/exchange/schedule/import", content, months=json.dumps(["2030-12"]))
    assert skipped.json()["created"] == 0

    result = upload(client, admin_headers, "/api/exchange/schedule/import", content, mode="fill").json()
    assert (result["created"], result["skipped"]) == (1, 1)
    assert [s["user_id"] for s in shifts_of(client, admin_headers, "2030-11-01")] == [olga]

    result = upload(client, admin_headers, "/api/exchange/schedule/import", content).json()
    assert result["updated"] == 1
    assert [s["user_id"] for s in shifts_of(client, admin_headers, "2030-11-01")] == [ivan]


def test_schedule_import_is_admin_only_and_validates(client, admin_headers, user_headers):
    content = make_schedule([])
    assert upload(client, user_headers, "/api/exchange/schedule/import", content).status_code == 403
    bad = upload(client, admin_headers, "/api/exchange/schedule/preview", b"not a zip")
    assert bad.status_code == 400
    empty = Workbook()
    buffer = io.BytesIO()
    empty.save(buffer)
    assert upload(client, admin_headers, "/api/exchange/schedule/preview", buffer.getvalue()).status_code == 400
    assert client.get("/api/exchange/schedule.xlsx", headers=user_headers,
                      params={"month_from": "2030-12", "month_to": "2030-01"}).status_code == 400
