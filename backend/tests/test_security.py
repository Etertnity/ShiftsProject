"""Проверки защиты: подбор пароля, подделка токенов, заголовки, права."""
import base64
import json
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings
from tests.conftest import ADMIN, login


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_lockout_after_failed_attempts(client):
    for _ in range(settings.login_max_attempts):
        assert client.post("/api/token", data={"username": "Sideffect", "password": "wrong"}).status_code == 401
    # Даже верный пароль не принимается, пока действует блокировка
    blocked = client.post("/api/token", data=ADMIN)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0


def test_unknown_login_and_wrong_password_look_the_same(client):
    unknown = client.post("/api/token", data={"username": "nobody", "password": "x"})
    wrong = client.post("/api/token", data={"username": "Sideffect", "password": "x"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_forged_tokens_are_rejected(client, admin_headers):
    exp = datetime.now(timezone.utc) + timedelta(hours=1)
    # Ключ, который раньше был зашит в код и виден в публичном репозитории
    forged = jwt.encode({"sub": "Sideffect", "ver": 1, "exp": exp}, "dev-secret-key-change-me", algorithm="HS256")
    assert client.get("/api/me", headers=_bearer(forged)).status_code == 401

    # Токен без подписи (alg=none)
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    body = base64.urlsafe_b64encode(json.dumps({"sub": "Sideffect", "ver": 1, "exp": int(exp.timestamp())}).encode()).rstrip(b"=").decode()
    assert client.get("/api/me", headers=_bearer(f"{header}.{body}.")).status_code == 401

    # Просроченный токен
    expired = jwt.encode({"sub": "Sideffect", "ver": 1, "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
                         settings.secret_key, algorithm="HS256")
    assert client.get("/api/me", headers=_bearer(expired)).status_code == 401


def test_default_admin_must_change_password_before_using_api(client):
    headers = login(client, **ADMIN)
    assert client.get("/api/me", headers=headers).status_code == 200
    assert client.get("/api/users/", headers=headers).status_code == 403
    assert client.post("/api/users/", headers=headers, json={
        "username": "evil", "password": "evil-pass-1", "name": "x", "position": "x", "is_admin": True,
    }).status_code == 403


def test_security_headers_and_no_cache(client, admin_headers):
    response = client.get("/api/me", headers=admin_headers)
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Cache-Control"] == "no-store"
    assert "server" not in {k.lower() for k in response.headers if response.headers[k].startswith("uvicorn")}


def test_input_limits(client, admin_headers):
    huge = "x" * 30000
    assert client.post("/api/assets/", headers=admin_headers, json={
        "title": "t", "description": huge, "asset_type": "CASE",
    }).status_code == 422
    assert client.post("/api/token", data={"username": "a" * 500, "password": "b"}).status_code in (401, 422)


def test_api_requires_auth(client):
    for path in ("/api/users/public", "/api/assets/", "/api/handovers/", "/api/shifts/", "/api/monitoring/vessels"):
        assert client.get(path).status_code == 401, path
