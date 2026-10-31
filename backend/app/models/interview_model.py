from datetime import datetime, timezone
import math
from typing import Any
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

    if score and score.get("question_scores"):
        qs = score["question_scores"]
        speech = [q.get("speech_analysis", {}) for q in qs]
        speech_with_words = [item for item in speech if item.get("word_count", 0) > 0]
        wpms = [item.get("words_per_minute", 0) for item in speech_with_words if item.get("duration_seconds", 0) > 0]
        fillers = [item.get("filler_count", 0) for item in speech_with_words]
        webcam_values = {
            "face_visibility_pct": [],
            "centered_frame_pct": [],
            "head_movement_index": [],
        }
        camera_answers = 0
        for question_score in qs:
            metrics = question_score.get("webcam_metrics") or {}
            had_metrics = False
            for key in webcam_values:
                value = metrics.get(key)
                if value is None:
                    continue
                try:
                    numeric_value = float(value)
                    if not math.isfinite(numeric_value):
                        continue
                    webcam_values[key].append(max(0.0, min(100.0, numeric_value)))
                    had_metrics = True
                except (TypeError, ValueError):
                    continue
            camera_answers += int(had_metrics)
        summary["voice_summary"] = {
            "average_wpm": sum(wpms) / len(wpms) if wpms else 0,
            "average_fillers": sum(fillers) / len(fillers) if fillers else 0,
            "answers_with_speech": len(speech_with_words),
        }
        summary["webcam_summary"] = {
            "average_face_visibility_pct": sum(webcam_values["face_visibility_pct"]) / len(webcam_values["face_visibility_pct"]) if webcam_values["face_visibility_pct"] else None,
            "average_centered_frame_pct": sum(webcam_values["centered_frame_pct"]) / len(webcam_values["centered_frame_pct"]) if webcam_values["centered_frame_pct"] else None,
            "average_head_movement_index": sum(webcam_values["head_movement_index"]) / len(webcam_values["head_movement_index"]) if webcam_values["head_movement_index"] else None,
            "answers_with_metrics": camera_answers,
        }
    else:
        summary["voice_summary"] = {"average_wpm": 0, "average_fillers": 0, "answers_with_speech": 0}
        summary["webcam_summary"] = {
            "average_face_visibility_pct": None,
            "average_centered_frame_pct": None,
            "average_head_movement_index": None,
            "answers_with_metrics": 0,
        }

    return summary
