from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.export import router as export_router
from app.api.routes.health import router as health_router
from app.api.routes.interviews import router as interviews_router
from app.api.routes.resume_optimizer import router as resume_optimizer_router
from app.api.routes.resumes import router as resumes_router
from app.core.config import settings
from app.db.mongodb import close_mongo_connection, connect_to_mongo

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    yield
    await close_mongo_connection()


app = FastAPI(title=settings.app_name, lifespan=lifespan)


@app.middleware("http")
async def log_bad_request_route(request, call_next):
    response = await call_next(request)
    if response.status_code == 400:
        route = request.scope.get("route")
        route_template = getattr(route, "path", "unmatched")
        logger.warning(
            "API client error status=400 method=%s route=%s",
            request.method,
            route_template,
        )
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(resumes_router, prefix=settings.api_prefix)
app.include_router(interviews_router, prefix=settings.api_prefix)
app.include_router(export_router, prefix=settings.api_prefix)
app.include_router(resume_optimizer_router, prefix=settings.api_prefix)
