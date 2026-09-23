from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.score_model import SCORES_COLLECTION, build_score_document
from app.utils.mongo import to_object_id


class ScoreRepository:
    def __init__(self, database: AsyncIOMotorDatabase):
        self.collection = database[SCORES_COLLECTION]

    async def upsert_score(
        self,
        user_id: str,
        interview_id: str,
        overall_score: float,
        communication_score: float,
        strengths: list[str],
        weaknesses: list[str],
        recommendations: list[str],
        improvement_suggestions: list[str],
        learning_roadmap: list[str],
        question_scores: list[dict[str, Any]],
        webcam_summary: dict[str, Any] | None = None,
        report: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        document = build_score_document(
            user_id=user_id,
            interview_id=interview_id,
            overall_score=overall_score,
            communication_score=communication_score,
            strengths=strengths,
            weaknesses=weaknesses,
            recommendations=recommendations,
            improvement_suggestions=improvement_suggestions,
            learning_roadmap=learning_roadmap,
            question_scores=question_scores,
            webcam_summary=webcam_summary,
            report=report,
        )
        await self.collection.update_one(
            {"interview_id": interview_id, "user_id": user_id},
            {"$set": document},
            upsert=True,
        )
        return await self.collection.find_one({"interview_id": interview_id, "user_id": user_id})

    async def get_by_interview_and_user(self, interview_id: str, user_id: str) -> dict[str, Any] | None:
        return await self.collection.find_one({"interview_id": interview_id, "user_id": user_id})
