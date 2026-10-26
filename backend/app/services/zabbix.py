"""Клиент Zabbix JSON-RPC для ICMP-монитора.

Браузер не ходит в Zabbix напрямую: учётные данные хранятся только на сервере, а ответы
кэшируются на минуту — десять открытых вкладок не превращаются в десять нагрузок на Zabbix.
"""
import asyncio
import logging
import re
import time
from typing import Dict, List, Optional, Tuple

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

Point = Tuple[int, float]

# Сколько точек максимум отдаём на один график: на карточку шириной ~400 px больше не нужно
MAX_POINTS = 1200
FULL_CACHE_TTL = 50  # сек


class ZabbixError(Exception):
    pass


class ZabbixNotConfigured(ZabbixError):
    pass


def parse_item_id(value: str) -> Optional[str]:
    """Item ID из числа или из ссылки на график Zabbix (…itemids%5B%5D=12345)."""
    value = (value or "").strip()
    if re.fullmatch(r"\d+", value):
        return value
    match = re.search(r"itemids(?:%5B%5D|\[\])=(\d+)", value, re.IGNORECASE) or re.search(r"[?&]itemid=(\d+)", value, re.IGNORECASE)
    return match.group(1) if match else None


def downsample(points: List[Point], limit: int = MAX_POINTS) -> List[Point]:
    """Сокращает число точек, сохраняя пики потерь: из каждой корзины берём максимум."""
    if len(points) <= limit:
        return points
    bucket = len(points) / limit
    result: List[Point] = []
    for index in range(limit):
        chunk = points[int(index * bucket):int((index + 1) * bucket)] or [points[-1]]
        result.append(max(chunk, key=lambda p: p[1]))
    return result


class ZabbixClient:
    def __init__(self) -> None:
        self._token: Optional[str] = None
        self._login_lock = asyncio.Lock()
        self._cache: Dict[Tuple[str, int], Tuple[float, List[Point]]] = {}
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def _api_url(self) -> str:
        return f"{settings.zabbix_url}/api_jsonrpc.php"

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=5.0))
        return self._client

    async def _rpc(self, method: str, params: dict, auth: Optional[str]) -> object:
        body = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
        if auth:
            body["auth"] = auth
        try:
            response = await self._http().post(self._api_url, json=body)
        except httpx.HTTPError as exc:
            raise ZabbixError(f"Zabbix недоступен: {exc.__class__.__name__}") from exc
        if response.status_code != 200:
            raise ZabbixError(f"Zabbix ответил HTTP {response.status_code}")
        data = response.json()
        if "error" in data:
            error = data["error"]
            raise ZabbixError(str(error.get("data") or error.get("message") or error))
        return data.get("result")

    async def _login(self) -> str:
        async with self._login_lock:
            if self._token:
                return self._token
            self._token = str(await self._rpc("user.login", {"username": settings.zabbix_user, "password": settings.zabbix_password}, None))
            return self._token

    async def call(self, method: str, params: dict) -> object:
        if not settings.zabbix_configured:
            raise ZabbixNotConfigured("Мониторинг не настроен: задайте ZABBIX_URL, ZABBIX_USER и ZABBIX_PASSWORD")
        token = self._token or await self._login()
        try:
            return await self._rpc(method, params, token)
        except ZabbixError as exc:
            # Сессия истекла — перелогиниваемся один раз
            if re.search(r"session|re-?login|not authori[sz]ed", str(exc), re.IGNORECASE):
                self._token = None
                return await self._rpc(method, params, await self._login())
            raise

    async def history(self, item_id: str, time_from: int) -> List[Point]:
        limit = max(2000, (int(time.time()) - time_from) // 10 + 1)
        # Берём самые свежие точки (DESC) и разворачиваем — при большом периоде не теряется «хвост»
        rows = await self.call("history.get", {
            "itemids": [item_id], "history": 0, "time_from": time_from,
            "sortfield": "clock", "sortorder": "DESC", "limit": limit,
        })
        points = [(int(row["clock"]), float(row["value"])) for row in (rows or [])]
        points.reverse()
        return points

    async def history_for_period(self, item_id: str, hours: int) -> List[Point]:
        key = (item_id, hours)
        cached = self._cache.get(key)
        if cached and time.monotonic() - cached[0] < FULL_CACHE_TTL:
            return cached[1]
        points = downsample(await self.history(item_id, int(time.time()) - hours * 3600))
        now = time.monotonic()
        # Выметаем записи старше TTL (удалённые суда, другие периоды), чтобы кэш не копился
        for stale in [k for k, (at, _) in self._cache.items() if now - at >= FULL_CACHE_TTL]:
            del self._cache[stale]
        self._cache[key] = (now, points)
        return points

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


zabbix = ZabbixClient()
