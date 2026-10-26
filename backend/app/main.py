"""Точка сборки FastAPI-приложения."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.init_db import create_default_admin, create_tables
from app.db.migrations import run_migrations
from app.db.session import SessionLocal, engine
from app.services.zabbix import zabbix

setup_logging()
logger = logging.getLogger("app")

# Заголовки на каждый ответ API: запрет встраивания во фреймы, MIME-сниффинга и кэширования данных
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-store",
}


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.is_production and "*" in settings.cors_origins:
        logger.warning("CORS_ORIGINS='*' в продакшене: API доступно скриптам с любых сайтов. Укажите конкретные адреса")
    create_tables(engine)
    with SessionLocal() as db:
        run_migrations(engine, db)
        create_default_admin(db)
    yield
    # Закрываем соединения с Zabbix и пул БД при остановке сервера
    await zabbix.close()
    engine.dispose()


def create_app() -> FastAPI:
    docs = settings.api_docs_enabled
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        lifespan=lifespan,
        # Swagger и схема API в продакшене выключены: они подсказывают атакующему все эндпоинты
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )

    if settings.cors_origins:
        allow_all = settings.cors_origins == ["*"]
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            # Браузеры запрещают credentials вместе с "*", а токен у нас всё равно в заголовке
            allow_credentials=not allow_all,
            allow_methods=["GET", "POST", "PUT", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        return response

    @app.get("/", tags=["health"])
    def health():
        return {"status": "ok"}

    app.include_router(api_router)
    return app


app = create_app()
