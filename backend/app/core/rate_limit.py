"""Защита входа от подбора пароля.

Счётчики живут в памяти процесса: бэкенд запускается одним процессом uvicorn, а после перезапуска
сбросить блокировку — не проблема. Ключи — и логин, и IP: перебор паролей к одному логину
и перебор логинов с одного адреса блокируются независимо.
"""
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

# Перебор случайных логинов создаёт по ключу на каждую попытку — периодически выметаем устаревшие
SWEEP_EVERY = 200
MAX_KEYS = 50_000

from app.core.config import settings


class LoginLimiter:
    def __init__(self) -> None:
        self._failures: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._calls = 0

    @property
    def window(self) -> float:
        return settings.login_lockout_minutes * 60

    def _prune(self, key: str, now: float) -> Deque[float]:
        attempts = self._failures[key]
        while attempts and now - attempts[0] > self.window:
            attempts.popleft()
        return attempts

    def retry_after(self, *keys: str) -> int:
        """Сколько секунд ждать, если хотя бы один из ключей заблокирован; 0 — можно пробовать."""
        now = time.monotonic()
        wait = 0.0
        with self._lock:
            for key in keys:
                if key not in self._failures:  # не создаём пустые записи на каждую проверку
                    continue
                attempts = self._prune(key, now)
                if len(attempts) >= settings.login_max_attempts:
                    wait = max(wait, self.window - (now - attempts[0]))
        return int(wait) + 1 if wait > 0 else 0

    def _sweep(self, now: float) -> None:
        for key in [k for k, attempts in self._failures.items() if not attempts or now - attempts[-1] > self.window]:
            del self._failures[key]
        # Защита от наплыва: если ключей всё равно слишком много — оставляем самые свежие
        if len(self._failures) > MAX_KEYS:
            newest = sorted(self._failures.items(), key=lambda item: item[1][-1], reverse=True)[:MAX_KEYS]
            self._failures = defaultdict(deque, newest)

    def fail(self, *keys: str) -> None:
        now = time.monotonic()
        with self._lock:
            for key in keys:
                self._prune(key, now).append(now)
            self._calls += 1
            if self._calls % SWEEP_EVERY == 0:
                self._sweep(now)

    def success(self, *keys: str) -> None:
        with self._lock:
            for key in keys:
                self._failures.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._failures.clear()


login_limiter = LoginLimiter()
