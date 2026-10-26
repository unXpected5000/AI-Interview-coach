from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings
from app.models.answer_model import ANSWERS_COLLECTION
from app.models.interview_model import INTERVIEWS_COLLECTION
from app.models.resume_model import RESUMES_COLLECTION
from app.models.score_model import SCORES_COLLECTION
from app.models.user_model import USERS_COLLECTION

mongo_client: AsyncIOMotorClient | None = None


async def connect_to_mongo() -> None:
    global mongo_client
    if settings.mongodb_uri:
        mongo_client = AsyncIOMotorClient(settings.mongodb_uri)
        await ensure_indexes()


async def close_mongo_connection() -> None:
    global mongo_client
    if mongo_client is not None:
        mongo_client.close()
        mongo_client = None


def get_database() -> AsyncIOMotorDatabase:
    if mongo_client is None:
        raise RuntimeError("MongoDB client is not initialized.")
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
