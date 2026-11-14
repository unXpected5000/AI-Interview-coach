from datetime import datetime, timezone
from typing import Any
from app.services.camera_metrics import summarize_webcam
from app.services.readiness_service import build_assessment_summary

INTERVIEWS_COLLECTION = "interviews"


def build_interview_document(
    user_id: str,
    resume_id: str,
    skills: list[str],
    questions: list[dict[str, Any]],
    initial_difficulty: str = "medium",
    difficulty_mode: str = "adaptive",
) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "resume_id": resume_id,
        "skills": skills,
        "questions": questions,
        "difficulty": {
            "initial": initial_difficulty,
            "current": "medium" if initial_difficulty == "interview_ready" and difficulty_mode == "adaptive" else initial_difficulty,
            "mode": difficulty_mode,
            "history": [],
        },
        "status": "active",
        "created_at": datetime.now(timezone.utc),
        "completed_at": None,
    }


def serialize_question(question: dict[str, Any], include_answer_key: bool = True) -> dict[str, Any]:
    """Serialize a question. The expected answer and key points stay server-side
    while an interview is active so they cannot be read from API responses."""
    serialized = {
        "question_id": question["question_id"],
        "skill": question["skill"],
        "difficulty": question["difficulty"],
        "question_type": question.get("question_type", "conceptual"),
        "topic_focus": question.get("topic_focus", question["skill"]),
        "source_section": question.get("source_section", "skills"),
        "question": question["question"],
        "expected_answer": question.get("expected_answer", ""),
        "expected_points": question.get("expected_points", question.get("key_points", [])),
        "key_points": question.get("expected_points", question.get("key_points", [])),
    }
    if not include_answer_key:
        serialized["expected_answer"] = None
        serialized["expected_points"] = []
        serialized["key_points"] = []
    if question.get("follow_up_for") is not None:
        serialized["follow_up_for"] = question.get("follow_up_for")
    if question.get("transition"):
        serialized["transition"] = str(question["transition"])[:160]
    return serialized


def interview_reveals_answer_key(document: dict[str, Any]) -> bool:
    return document.get("status") == "completed"


def serialize_interview(document: dict[str, Any], include_answer_key: bool | None = None) -> dict[str, Any]:
    if include_answer_key is None:
        include_answer_key = interview_reveals_answer_key(document)
    return {
        "id": str(document["_id"]),
        "user_id": document["user_id"],
        "resume_id": document["resume_id"],
        "skills": document.get("skills", []),
        "questions": [serialize_question(question, include_answer_key) for question in document.get("questions", [])],
        "status": document.get("status", "active"),
        "created_at": document.get("created_at"),
        "completed_at": document.get("completed_at"),
        "difficulty": document.get("difficulty", {"initial": "medium", "current": "medium", "mode": "adaptive", "history": []}),
    }


def serialize_interview_summary(document: dict[str, Any], score: dict[str, Any] | None = None) -> dict[str, Any]:
    summary = {
        "id": str(document["_id"]),
        "resume_id": document["resume_id"],
        "skills": document.get("skills", []),
        "status": document.get("status", "active"),
        "question_count": len(document.get("questions", [])),
        "created_at": document.get("created_at"),
        "completed_at": document.get("completed_at"),
        "overall_score": score.get("overall_score") if score else None,
        "communication_score": score.get("communication_score") if score else None,
        "question_scores": score.get("question_scores", []) if score else [],
        "strengths": score.get("strengths", []) if score else [],
        "weaknesses": score.get("weaknesses", []) if score else [],
        "difficulty": document.get("difficulty", {"initial": "medium", "current": "medium", "mode": "adaptive", "history": []}),
    }
    if score:
        summary.update(build_assessment_summary(score.get("overall_score", 0), score.get("question_scores", [])))

    question_scores = (score or {}).get("question_scores") or []
    speech = [q.get("speech_analysis", {}) or {} for q in question_scores]
    speech_with_words = [item for item in speech if item.get("word_count", 0) > 0]
    wpms = [item.get("words_per_minute", 0) for item in speech_with_words if item.get("duration_seconds", 0) > 0]
    fillers = [item.get("filler_count", 0) for item in speech_with_words]
    summary["voice_summary"] = {
        "average_wpm": sum(wpms) / len(wpms) if wpms else 0,
        "average_fillers": sum(fillers) / len(fillers) if fillers else 0,
        "answers_with_speech": len(speech_with_words),
    }
    summary["webcam_summary"] = summarize_webcam(question_scores)

    return summary
