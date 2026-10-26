from fastapi import APIRouter

from app.api.routes import assets, auth, exchange, handovers, monitoring, settings, shifts, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(shifts.router)
api_router.include_router(assets.router)
api_router.include_router(handovers.router)
api_router.include_router(settings.router)
api_router.include_router(monitoring.router)
api_router.include_router(exchange.router)
