from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.resume_model import RESUMES_COLLECTION, build_resume_document
from app.utils.mongo import to_object_id


class ResumeRepository:
    def __init__(self, database: AsyncIOMotorDatabase):
        self.collection = database[RESUMES_COLLECTION]

    async def create(
        self,
        user_id: str,
        filename: str,
        raw_text: str,
        extracted_skills: list[str],
        structured_resume: dict,
    ) -> dict[str, Any]:
        document = build_resume_document(
            user_id=user_id,
            filename=filename,
            raw_text=raw_text,
            extracted_skills=extracted_skills,
            structured_resume=structured_resume,
        )
        result = await self.collection.insert_one(document)
        return await self.collection.find_one({"_id": result.inserted_id})

    async def list_by_user(self, user_id: str) -> list[dict[str, Any]]:
        cursor = self.collection.find({"user_id": user_id}).sort("uploaded_at", -1)
        return await cursor.to_list(length=None)

    async def get_by_id_and_user(self, resume_id: str, user_id: str) -> dict[str, Any] | None:
        return await self.collection.find_one({"_id": to_object_id(resume_id), "user_id": user_id})

    async def delete_by_id_and_user(self, resume_id: str, user_id: str) -> bool:
        result = await self.collection.delete_one(
            {"_id": to_object_id(resume_id), "user_id": user_id}
        )
        return result.deleted_count == 1
