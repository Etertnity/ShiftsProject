"""Единая настройка логирования (вместо print, который падал на Windows-консоли с cp1251)."""
import logging
import os


def setup_logging() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
