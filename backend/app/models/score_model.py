from datetime import datetime, timezone
from typing import Any

SCORES_COLLECTION = "scores"


def build_score_document(
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
    return {
        "user_id": user_id,
        "interview_id": interview_id,
        "overall_score": overall_score,
        "communication_score": communication_score,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "recommendations": recommendations,
        "improvement_suggestions": improvement_suggestions,
        "learning_roadmap": learning_roadmap,
        "question_scores": question_scores,
        "webcam_summary": webcam_summary or {},
        "report": report or {},
        "created_at": datetime.now(timezone.utc),
    }


def serialize_score(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "user_id": document["user_id"],
        "interview_id": document["interview_id"],
        "overall_score": document["overall_score"],
        "communication_score": document.get("communication_score", 0),
        "strengths": document.get("strengths", []),
        "weaknesses": document.get("weaknesses", []),
        "recommendations": document.get("recommendations", []),
        "improvement_suggestions": document.get("improvement_suggestions", document.get("recommendations", [])),
        "learning_roadmap": document.get("learning_roadmap", []),
        "question_scores": document.get("question_scores", []),
        "webcam_summary": document.get("webcam_summary"),
        "report": document.get("report", {}),
        "created_at": document.get("created_at"),
    }
