from datetime import datetime, timezone
from typing import Any

ANSWERS_COLLECTION = "answers"


def build_answer_document(
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
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "user_id": user_id,
        "interview_id": interview_id,
        "question_id": question_id,
        "answer_text": answer_text,
        "transcript": transcript,
        "semantic_score": semantic_score,
        "communication_score": communication_score,
        "evaluation": evaluation,
        "score": evaluation.get("score", semantic_score),
        "matched_points": evaluation.get("matched_points", []),
        "missing_points": evaluation.get("missing_points", []),
        "completeness_score": evaluation.get("completeness_score", 0),
        "relevance_score": evaluation.get("relevance_score", 0),
        "speech_analysis": speech_analysis or evaluation.get("speech_analysis", {}),
        "webcam_metrics": webcam_metrics or {},
        "answered_at": now,
        "updated_at": now,
    }


def serialize_answer(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "user_id": document["user_id"],
        "interview_id": document["interview_id"],
        "question_id": document["question_id"],
        "answer_text": document["answer_text"],
        "transcript": document.get("transcript", document["answer_text"]),
        "semantic_score": document.get("semantic_score", 0),
        "communication_score": document.get("communication_score", 0),
        "score": document.get("score", document.get("semantic_score", 0)),
        "matched_points": document.get("matched_points", []),
        "missing_points": document.get("missing_points", []),
        "completeness_score": document.get("completeness_score", 0),
        "relevance_score": document.get("relevance_score", 0),
        "evaluation": document.get("evaluation", {}),
        "speech_analysis": document.get("speech_analysis", {}),
        "webcam_metrics": document.get("webcam_metrics"),
        "answered_at": document.get("answered_at"),
        "updated_at": document.get("updated_at"),
    }
