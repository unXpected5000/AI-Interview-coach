from __future__ import annotations

from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.resume_optimizer_model import (
    RESUME_OPTIMIZATIONS_COLLECTION,
    build_resume_optimization_document,
)


class ResumeOptimizerRepository:
    def __init__(self, database: AsyncIOMotorDatabase):
        self.collection = database[RESUME_OPTIMIZATIONS_COLLECTION]

    async def get_by_cache_key(self, cache_key: str, user_id: str) -> dict[str, Any] | None:
        return await self.collection.find_one({"cache_key": cache_key, "user_id": user_id})

    async def create(
        self,
        user_id: str,
        resume_id: str,
        target_role: str,
        company_name: str | None,
        job_description: str | None,
        cache_key: str,
        result: dict[str, Any],
    ) -> dict[str, Any]:
        document = build_resume_optimization_document(
            user_id=user_id,
            resume_id=resume_id,
            target_role=target_role,
            company_name=company_name,
            job_description=job_description,
            cache_key=cache_key,
            result=result,
        )
        result_insert = await self.collection.insert_one(document)
        return await self.collection.find_one({"_id": result_insert.inserted_id})

    async def delete_by_resume_and_user(self, resume_id: str, user_id: str) -> None:
        await self.collection.delete_many({"resume_id": resume_id, "user_id": user_id})
