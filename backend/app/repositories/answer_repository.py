from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.answer_model import ANSWERS_COLLECTION, build_answer_document
from app.utils.mongo import to_object_id


class AnswerRepository:
    def __init__(self, database: AsyncIOMotorDatabase):
        self.collection = database[ANSWERS_COLLECTION]

    async def upsert_answer(
        self,
        user_id: str,
        interview_id: str,
        question_id: int,
        answer_text: str,
        transcript: str,
        semantic_score: float,
        communication_score: float,
        evaluation: dict[str, Any],
        speech_analysis: dict[str, Any] | None = None,
        webcam_metrics: dict[str, Any] | None = None,
        answer_status: str = "answered",
    ) -> dict[str, Any]:
        document = build_answer_document(
            user_id=user_id,
            interview_id=interview_id,
            question_id=question_id,
            answer_text=answer_text,
            transcript=transcript,
            semantic_score=semantic_score,
            communication_score=communication_score,
            evaluation=evaluation,
            speech_analysis=speech_analysis,
            webcam_metrics=webcam_metrics,
            answer_status=answer_status,
        )
        await self.collection.update_one(
            {"interview_id": interview_id, "question_id": question_id, "user_id": user_id},
            {"$set": document},
            upsert=True,
        )
        return await self.collection.find_one(
            {"interview_id": interview_id, "question_id": question_id, "user_id": user_id}
        )

    async def list_by_interview(self, interview_id: str, user_id: str) -> list[dict[str, Any]]:
        cursor = self.collection.find({"interview_id": interview_id, "user_id": user_id}).sort("question_id", 1)
        return await cursor.to_list(length=None)

    async def get_by_interview_and_question(
        self,
        interview_id: str,
        question_id: int,
        user_id: str,
    ) -> dict[str, Any] | None:
        return await self.collection.find_one(
            {"interview_id": interview_id, "question_id": question_id, "user_id": user_id}
        )

    async def delete_by_interview_ids_and_user(self, interview_ids: list[str], user_id: str) -> None:
        if interview_ids:
            await self.collection.delete_many(
                {"interview_id": {"$in": interview_ids}, "user_id": user_id}
            )
