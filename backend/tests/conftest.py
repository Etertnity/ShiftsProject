import os
from datetime import datetime
import sys
import tempfile
from pathlib import Path

import pytest

# Тесты работают на отдельной временной БД — рабочие данные не затрагиваются
_tmp_dir = tempfile.mkdtemp(prefix="shifts-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp_dir, 'test.db').as_posix()}"
os.environ.setdefault("SECRET_KEY", "test-secret")
# В бою пароль администратора генерируется случайно; в тестах задаём явно
os.environ["DEFAULT_ADMIN_PASSWORD"] = "admin123"
# Локальный .env (например, с настоящим Zabbix) не должен влиять на тесты
for _name in ("ZABBIX_URL", "ZABBIX_USER", "ZABBIX_PASSWORD", "ZABBIX_WEB_URL", "CORS_ORIGINS", "APP_ENV"):
    os.environ[_name] = ""

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.core.rate_limit import login_limiter  # noqa: E402
from app.db.session import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

ADMIN = {"username": "Sideffect", "password": "admin123"}
ADMIN_OWN_PASSWORD = "admin-own-pass"
WORKER_TEMP_PASSWORD = "secret12"
WORKER_OWN_PASSWORD = "worker-own-pass"


@pytest.fixture(autouse=True)
def fixed_now(monkeypatch):
    """Тестовые смены — в 2026 году; «сейчас» фиксируем раньше них, чтобы они считались будущими
    (начавшиеся смены может менять только администратор)."""
    from app.services import schedule

    monkeypatch.setattr(schedule, "now_local", lambda: datetime(2026, 1, 5, 12, 0))


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    login_limiter.reset()
    with TestClient(app) as test_client:  # запускает lifespan: таблицы + админ
        yield test_client


def login(client, username, password):
    response = client.post("/api/token", data={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def set_own_password(client, headers, current, new):
    """Первый вход с временным паролем: без смены пароля API недоступно."""
    response = client.post("/api/profile/password", headers=headers, json={"current_password": current, "new_password": new})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def admin_headers(client):
    return set_own_password(client, login(client, **ADMIN), ADMIN["password"], ADMIN_OWN_PASSWORD)


@pytest.fixture()
def user_headers(client, admin_headers):
    response = client.post("/api/users/", headers=admin_headers, json={
        "username": "worker", "password": WORKER_TEMP_PASSWORD, "name": "Работник", "position": "Инженер",
    })
    assert response.status_code == 200, response.text
    headers = login(client, "worker", WORKER_TEMP_PASSWORD)
    return set_own_password(client, headers, WORKER_TEMP_PASSWORD, WORKER_OWN_PASSWORD)
