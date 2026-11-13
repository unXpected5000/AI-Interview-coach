from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db.mongodb import ping_database

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def liveness() -> dict[str, str]:
    """Process is running. Does not check dependencies."""
    return {"status": "ok"}


@router.get("/health")
async def health_check() -> JSONResponse:
    """Readiness: the API is only healthy when its required MongoDB responds."""
    database = await ping_database()
    if database != "ok":
        return JSONResponse({"status": "unavailable", "database": database}, status_code=503)
    return JSONResponse({"status": "ok", "database": "ok"})
