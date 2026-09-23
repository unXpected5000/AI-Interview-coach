from datetime import datetime, timezone
from typing import Any

INTERVIEWS_COLLECTION = "interviews"


def build_interview_document(
    user_id: str,
    resume_id: str,
    skills: list[str],
    questions: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "resume_id": resume_id,
        "skills": skills,
        "questions": questions,
        "status": "active",
        "created_at": datetime.now(timezone.utc),
        "completed_at": None,
    }


def serialize_question(question: dict[str, Any]) -> dict[str, Any]:
    return {
        "question_id": question["question_id"],
        "skill": question["skill"],
        "difficulty": question["difficulty"],
        "question_type": question.get("question_type", "conceptual"),
        "topic_focus": question.get("topic_focus", question["skill"]),
        "source_section": question.get("source_section", "skills"),
        "question": question["question"],
        "expected_answer": question["expected_answer"],
        "expected_points": question.get("expected_points", question.get("key_points", [])),
        "key_points": question.get("expected_points", question.get("key_points", [])),
    }


def serialize_interview(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "user_id": document["user_id"],
        "resume_id": document["resume_id"],
        "skills": document.get("skills", []),
        "questions": [serialize_question(question) for question in document.get("questions", [])],
        "status": document.get("status", "active"),
        "created_at": document.get("created_at"),
        "completed_at": document.get("completed_at"),
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
    }

    if score and score.get("question_scores"):
        qs = score["question_scores"]
        wpms = [q.get("speech_analysis", {}).get("words_per_minute", 0) for q in qs if q.get("speech_analysis", {}).get("words_per_minute") is not None]
        fillers = [q.get("speech_analysis", {}).get("filler_count", 0) for q in qs if q.get("speech_analysis", {}).get("filler_count") is not None]
        eye_contacts = [q.get("webcam_metrics", {}).get("eye_contact_duration", 0) for q in qs if q.get("webcam_metrics", {}).get("eye_contact_duration") is not None]

        if not eye_contacts:
            eye_contacts = [q.get("webcam_metrics", {}).get("eye_contact", 0) for q in qs if q.get("webcam_metrics", {}).get("eye_contact") is not None]

        summary["voice_summary"] = {
            "average_wpm": sum(wpms) / len(wpms) if wpms else 0,
            "average_fillers": sum(fillers) / len(fillers) if fillers else 0
        }
        summary["webcam_summary"] = {
            "average_eye_contact": sum(eye_contacts) / len(eye_contacts) if eye_contacts else 0
        }
    else:
        summary["voice_summary"] = {"average_wpm": 0, "average_fillers": 0}
        summary["webcam_summary"] = {"average_eye_contact": 0}

    return summary
