from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.interview_model import INTERVIEWS_COLLECTION, build_interview_document
from app.utils.mongo import to_object_id


class InterviewRepository:
    def __init__(self, database: AsyncIOMotorDatabase):
        self.collection = database[INTERVIEWS_COLLECTION]

    async def create(
        self,
        user_id: str,
        resume_id: str,
        skills: list[str],
        questions: list[dict[str, Any]],
    ) -> dict[str, Any]:
        document = build_interview_document(
            user_id=user_id,
            resume_id=resume_id,
            skills=skills,
            questions=questions,
        )
        result = await self.collection.insert_one(document)
        return await self.collection.find_one({"_id": result.inserted_id})

    async def get_by_id_and_user(self, interview_id: str, user_id: str) -> dict[str, Any] | None:
        return await self.collection.find_one({"_id": to_object_id(interview_id), "user_id": user_id})

    async def get_by_user_and_resume(self, user_id: str, resume_id: str) -> dict[str, Any] | None:
        return await self.collection.find_one({"user_id": user_id, "resume_id": resume_id})

    async def list_by_user(self, user_id: str) -> list[dict[str, Any]]:
        cursor = self.collection.find({"user_id": user_id}).sort("created_at", -1)
        return await cursor.to_list(length=None)

    async def set_completed(self, interview_id: str) -> dict[str, Any] | None:
        await self.collection.update_one(
            {"_id": to_object_id(interview_id)},
            {
                "$set": {
                    "status": "completed",
                    "completed_at": datetime.now(timezone.utc),
                }
            },
        )
        return await self.collection.find_one({"_id": to_object_id(interview_id)})
