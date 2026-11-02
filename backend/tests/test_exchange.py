"""Обмен с Excel: загрузка журнала передач в формате ручной таблицы и выгрузка обратно."""
import io
import json

from openpyxl import Workbook, load_workbook

CLOSED = ("Completed", "Closed")

HEADERS = [
    "Дата",
    "Фамилия сменного",
    "Intraservice:\nЧто сделано по Case за смену. Новые Case. Закрытые Case.",
    None,  # пустая колонка, как в реальном журнале
    "Взаимодействие с Orange. Открытые Case(требуется работа).",
    "Разное: Мониторинг, вопросы",
    "Change management запросы.",
]

ROWS = [
    [
        "17.10.2026 21:00 -\n18.10.2026 09:00", "Работник",
        "1) Continue CASE#100 Alpha - замена модема\n2) Open CASE Beta CASE#101 - выход из сети\nпродолжение строки\n"
        "3) Open-Close CASE#102 Gamma - кратковременный обрыв",
        None,
        "1) Open CASE#9001 Alpha - проактивно",
        "1) Позвонить на судно утром",
        "1) CASE#500. Delta IMO: 1 - правило на ASA",
    ],
    [
        "18.10.2026 9:00\n18.10.2026 21:00", "Новиков",
        "1) Continue CASE#100 Alpha - замена модема\n2) Close CASE#101 Beta - восстановились",
        None, "1) Continue CASE#9001 Alpha - проактивно", "", "",
    ],
    ["неизвестно когда", "Работник", "1) Open CASE#999 Bad - x", None, "", "", ""],
]


def make_workbook(rows=ROWS, headers=HEADERS) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def upload(client, headers, url, content, mapping=None):
    data = {"mapping": json.dumps(mapping)} if mapping else None
    return client.post(url, headers=headers, data=data,
                       files={"file": ("journal.xlsx", content, "application/octet-stream")})


def test_preview_guesses_columns_and_parses_rows(client, admin_headers):
    response = upload(client, admin_headers, "/api/exchange/import/preview", make_workbook())
    assert response.status_code == 200, response.text
    preview = response.json()
    targets = {c["letter"]: c["target"] for c in preview["columns"]}
    assert targets == {"A": "date", "B": "person", "C": "category:CASE", "E": "category:ORANGE_CASE",
                       "F": "notes", "G": "category:CHANGE_MANAGEMENT"}
    rows = preview["rows"]
    assert rows[0]["start"] == "2026-10-17T21:00" and rows[0]["end"] == "2026-10-18T09:00"
    assert rows[0]["items"] == {"CASE": 3, "ORANGE_CASE": 1, "CHANGE_MANAGEMENT": 1}
    assert rows[1]["start"] == "2026-10-18T09:00"
    assert rows[2]["error"]
    # Предпросмотр ничего не сохраняет
    assert client.get("/api/handovers/", headers=admin_headers).json() == []


def test_import_creates_handovers_cases_and_history(client, admin_headers, user_headers):
    response = upload(client, admin_headers, "/api/exchange/import", make_workbook())
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["handovers"] == 2 and result["duplicates"] == 0
    assert result["assets_created"] == 5
    assert len(result["errors"]) == 1

    assets = {a["title"]: a for a in client.get("/api/assets/", headers=user_headers, params={"include_closed": True}).json()}
    assert set(assets) == {"CASE#100 Alpha", "CASE#101 Beta", "CASE#102 Gamma", "CASE#9001 Alpha", "CASE#500 Delta IMO: 1"}
    assert assets["CASE#101 Beta"]["status"] in CLOSED
    assert assets["CASE#102 Gamma"]["status"] in CLOSED  # Open-Close
    assert assets["CASE#100 Alpha"]["status"] == "Active"
    assert assets["CASE#101 Beta"]["description"] == "выход из сети продолжение строки"
    assert assets["CASE#100 Alpha"]["asset_type"] == "CASE" and assets["CASE#9001 Alpha"]["asset_type"] == "ORANGE_CASE"

    handovers = client.get("/api/handovers/", headers=user_headers).json()
    first = handovers[-1]
    assert first["handover_notes"] == "1) Позвонить на судно утром"
    assert len(first["assets"]) == 5
    # Конец смены 18.10 09:00 МСК = 06:00 UTC
    assert first["created_at"] == "2026-10-18T06:00:00Z"

    # Одинаковый «Continue» в следующей смене не плодит запись в истории; закрытие — пишет
    alpha = client.get(f"/api/assets/{assets['CASE#100 Alpha']['id']}/entries", headers=user_headers).json()
    assert [e["kind"] for e in alpha] == ["created"]
    beta = sorted(client.get(f"/api/assets/{assets['CASE#101 Beta']['id']}/entries", headers=user_headers).json(),
                  key=lambda e: e["id"])
    assert [e["kind"] for e in beta] == ["created", "status"]
    # Автор — сотрудник, найденный по фамилии из файла, или сама фамилия
    assert [e["author_name"] for e in beta] == ["Работник", "Новиков"]

    # Повторная загрузка того же файла ничего не задваивает
    again = upload(client, admin_headers, "/api/exchange/import", make_workbook()).json()
    assert again["handovers"] == 0 and again["duplicates"] == 2 and again["assets_created"] == 0


def test_import_links_only_own_shift(client, admin_headers, user_headers):
    admin = client.get("/api/me", headers=admin_headers).json()
    worker = client.get("/api/me", headers=user_headers).json()
    # 17.10 21:00 — смена сотрудника «Работник» (он есть в файле), 18.10 09:00 — чужая смена (в файле «Новиков»)
    own = client.post("/api/shifts/", headers=user_headers, json={
        "date": "2026-10-17", "shift_type": "night", "start_time": "21:00", "end_time": "09:00", "user_id": worker["id"],
    }).json()
    client.post("/api/shifts/", headers=admin_headers, json={
        "date": "2026-10-18", "shift_type": "day", "start_time": "09:00", "end_time": "21:00", "user_id": admin["id"],
    })
    upload(client, admin_headers, "/api/exchange/import", make_workbook())
    handovers = sorted(client.get("/api/handovers/", headers=admin_headers).json(), key=lambda h: h["created_at"])
    assert handovers[0]["from_shift_id"] == own["id"]
    assert handovers[1]["from_shift_id"] is None


def test_export_round_trip(client, admin_headers, user_headers):
    upload(client, admin_headers, "/api/exchange/import", make_workbook())
    response = client.get("/api/exchange/export.xlsx", headers=user_headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats")
    wb = load_workbook(io.BytesIO(response.content))
    assert wb.sheetnames == ["Передачи", "Кейсы", "История"]
    sheet = wb["Передачи"]
    header = [c.value for c in sheet[1]]
    assert header[0] == "Дата" and header[-2:] == ["Разное", "№ на сайте"]
    first = [c.value for c in sheet[2]]
    assert first[0] == "17.10.2026 21:00 -\n18.10.2026 09:00" and first[1] == "Работник"
    assert "Open-Close CASE#102 Gamma - кратковременный обрыв" in first[2]
    second = [c.value for c in sheet[3]]
    assert "Close CASE#101 Beta - восстановились" in second[2]
    assert wb["Кейсы"].max_row == 6

    # Тот же файл обратно — передачи узнаются по «№ на сайте»
    again = upload(client, admin_headers, "/api/exchange/import", response.content).json()
    assert again["handovers"] == 0 and again["duplicates"] == 2


def test_export_period_filter(client, admin_headers, user_headers):
    upload(client, admin_headers, "/api/exchange/import", make_workbook())
    response = client.get("/api/exchange/export.xlsx", headers=user_headers,
                          params={"date_from": "2026-10-18", "date_to": "2026-10-18"})
    wb = load_workbook(io.BytesIO(response.content))
    assert wb["Передачи"].max_row == 3  # обе смены закончились 18.10
    response = client.get("/api/exchange/export.xlsx", headers=user_headers,
                          params={"date_from": "2026-10-19", "date_to": "2026-10-19"})
    assert load_workbook(io.BytesIO(response.content))["Передачи"].max_row == 1
    assert client.get("/api/exchange/export.xlsx", headers=user_headers,
                      params={"date_from": "2026-10-20", "date_to": "2026-10-19"}).status_code == 400


def test_manual_mapping_and_validation(client, admin_headers):
    content = make_workbook()
    # Колонку можно направить в другую категорию или пропустить
    mapping = {"0": "date", "1": "person", "2": "category:CASE", "4": "skip", "5": "notes", "6": "skip"}
    preview = upload(client, admin_headers, "/api/exchange/import/preview", content, mapping).json()
    assert preview["rows"][0]["items"] == {"CASE": 3}
    assert upload(client, admin_headers, "/api/exchange/import/preview", content, {"0": "category:NOPE"}).status_code == 400
    assert upload(client, admin_headers, "/api/exchange/import/preview", content, {"1": "person"}).status_code == 400


def test_import_security(client, admin_headers, user_headers):
    content = make_workbook()
    # Загрузка — только администратору; выгрузка — всем сотрудникам, но не анонимам
    assert upload(client, user_headers, "/api/exchange/import", content).status_code == 403
    assert upload(client, user_headers, "/api/exchange/import/preview", content).status_code == 403
    assert client.get("/api/exchange/export.xlsx").status_code == 401
    # Не xlsx / битый файл / слишком большой
    assert client.post("/api/exchange/import/preview", headers=admin_headers,
                       files={"file": ("x.csv", b"a,b", "text/csv")}).status_code == 400
    assert upload(client, admin_headers, "/api/exchange/import/preview", b"not a zip").status_code == 400
    assert upload(client, admin_headers, "/api/exchange/import/preview", b"0" * (5 * 1024 * 1024 + 10)).status_code == 413


def test_export_neutralizes_formulas(client, user_headers):
    response = client.post("/api/assets/", headers=user_headers, json={
        "title": '=HYPERLINK("http://evil","click")', "description": "=1+1", "asset_type": "CASE",
    })
    assert response.status_code == 200
    content = client.get("/api/exchange/export.xlsx", headers=user_headers).content
    row = list(load_workbook(io.BytesIO(content))["Кейсы"][2])
    # Текст, похожий на формулу, сохраняется как строка — Excel не выполнит его
    assert row[2].data_type == "s" and row[2].value.startswith("=HYPERLINK")
    assert row[3].data_type == "s"


def test_case_status_follows_last_handover_in_file(client, admin_headers, user_headers):
    """Открыты только кейсы из последней передачи файла без Close; журнал может идти «новые сверху»."""
    site_only = client.post("/api/assets/", headers=user_headers, json={
        "title": "CASE#777 Site", "description": "заведён на сайте", "asset_type": "CASE",
    })
    assert site_only.status_code == 200, site_only.text
    newest_first = [
        ["19.10.2026 09:00 -\n19.10.2026 21:00", "Работник",
         "1) Continue CASE#300 Kilo - ждём Оранж\n2) Close CASE#301 Lima - восстановились", None, "", "", ""],
        ["18.10.2026 21:00 -\n19.10.2026 09:00", "Работник",
         "1) Continue CASE#300 Kilo - ждём Оранж\n2) Continue CASE#301 Lima - смотрим\n3) Continue CASE#302 Mike - смотрим",
         None, "", "", ""],
        ["18.10.2026 09:00 -\n18.10.2026 21:00", "Работник",
         "1) Open CASE#300 Kilo - ждём Оранж\n2) Open CASE#301 Lima - смотрим\n3) Open CASE#302 Mike - смотрим",
         None, "", "", ""],
    ]
    result = upload(client, admin_headers, "/api/exchange/import", make_workbook(rows=newest_first)).json()
    assert result["handovers"] == 3
    assert result["last_handover"] == "19.10.2026 21:00"

    def statuses():
        assets = client.get("/api/assets/", headers=user_headers, params={"include_closed": True}).json()
        return {a["title"]: a["status"] for a in assets}

    current = statuses()
    assert current["CASE#300 Kilo"] == "Active"     # есть в последней передаче
    assert current["CASE#301 Lima"] in CLOSED       # Close в последней передаче, хоть ниже по файлу и Continue
    assert current["CASE#302 Mike"] in CLOSED       # в последней передаче его уже нет
    assert current["CASE#777 Site"] == "Active"     # кейсы, которых нет в файле, не трогаем
    assert result["assets_closed"] == 1             # Mike закрыт правилом; Lima — самой передачей

    # Кейс открыли на сайте — повторная загрузка того же файла снова приводит его к последней передаче
    mike = next(a for a in client.get("/api/assets/", headers=user_headers, params={"include_closed": True}).json()
                if a["title"] == "CASE#302 Mike")
    client.put(f"/api/assets/{mike['id']}", headers=admin_headers, json={**{k: mike[k] for k in (
        "title", "description", "asset_type", "custom_fields")}, "status": "Active"})
    assert statuses()["CASE#302 Mike"] == "Active"
    again = upload(client, admin_headers, "/api/exchange/import", make_workbook(rows=newest_first)).json()
    assert again["handovers"] == 0 and again["assets_closed"] == 1
    assert statuses()["CASE#302 Mike"] in CLOSED
