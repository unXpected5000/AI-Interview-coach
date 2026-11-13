import asyncio
import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings
from app.models.answer_model import ANSWERS_COLLECTION
from app.models.interview_model import INTERVIEWS_COLLECTION
from app.models.resume_model import RESUMES_COLLECTION
from app.models.resume_optimizer_model import RESUME_OPTIMIZATIONS_COLLECTION
from app.models.score_model import SCORES_COLLECTION
from app.models.user_model import USERS_COLLECTION

logger = logging.getLogger(__name__)

mongo_client: AsyncIOMotorClient | None = None
HEALTH_PING_TIMEOUT_SECONDS = 3.0


async def connect_to_mongo() -> None:
    global mongo_client
    if settings.mongodb_uri:
        # Fail quickly when Atlas cannot be reached instead of allowing startup
        # and incoming requests to sit on PyMongo's 30-second default selection
        # timeout. Keep the pool bounded for the small Render instance.
        mongo_client = AsyncIOMotorClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=8000,
            connectTimeoutMS=5000,
            maxPoolSize=20,
            minPoolSize=0,
        )
        await ensure_indexes()
    else:
        logger.error("MONGODB_URI is not set; data routes and /api/health will report unavailable.")


async def close_mongo_connection() -> None:
    global mongo_client
    if mongo_client is not None:
        mongo_client.close()
        mongo_client = None


async def ping_database() -> str:
    """Return "ok", "not_configured", or "unreachable" without raising."""
    if mongo_client is None:
        return "not_configured"
    try:
        await asyncio.wait_for(mongo_client.admin.command("ping"), timeout=HEALTH_PING_TIMEOUT_SECONDS)
    except Exception:  # noqa: BLE001 - any failure means the dependency is unavailable
        return "unreachable"
    return "ok"


class DatabaseUnavailableError(RuntimeError):
    """The required MongoDB connection is not configured or not initialized."""


def get_database() -> AsyncIOMotorDatabase:
    if mongo_client is None:
        raise DatabaseUnavailableError("MongoDB client is not initialized.")
    return mongo_client[settings.mongodb_db_name]


async def ensure_indexes() -> None:
    if mongo_client is None:
        return

    database = mongo_client[settings.mongodb_db_name]
    await database[USERS_COLLECTION].create_index("email", unique=True)
    await database[USERS_COLLECTION].create_index(
        "google_id",
        unique=True,
        partialFilterExpression={"google_id": {"$type": "string"}},
    )
    await database[RESUMES_COLLECTION].create_index("user_id")
    interview_collection = database[INTERVIEWS_COLLECTION]
    interview_indexes = await interview_collection.index_information()
    resume_index_key = [("user_id", 1), ("resume_id", 1)]
    for index_name, index_data in interview_indexes.items():
        if index_data.get("key") == resume_index_key and index_data.get("unique"):
            await interview_collection.drop_index(index_name)
    await interview_collection.create_index(resume_index_key)
    await database[ANSWERS_COLLECTION].create_index(
        [("interview_id", 1), ("question_id", 1), ("user_id", 1)],
        unique=True,
    )
    await database[SCORES_COLLECTION].create_index([("interview_id", 1), ("user_id", 1)], unique=True)
    await database[RESUME_OPTIMIZATIONS_COLLECTION].create_index([("user_id", 1), ("cache_key", 1)])
    await database[RESUME_OPTIMIZATIONS_COLLECTION].create_index([("user_id", 1), ("resume_id", 1)])
    await database[USERS_COLLECTION].create_index([("role", 1), ("department", 1), ("name", 1)])
    await database[INTERVIEWS_COLLECTION].create_index([("user_id", 1), ("created_at", -1)])
    await database[SCORES_COLLECTION].create_index("user_id")
