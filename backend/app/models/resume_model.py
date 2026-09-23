from datetime import datetime, timezone
from typing import Any

RESUMES_COLLECTION = "resumes"


def build_resume_document(
    user_id: str,
    filename: str,
    raw_text: str,
    extracted_skills: list[str],
    structured_resume: dict[str, Any],
) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "filename": filename,
        "raw_text": raw_text,
        "extracted_skills": extracted_skills,
        "structured_resume": structured_resume,
        "uploaded_at": datetime.now(timezone.utc),
    }


def serialize_resume(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "user_id": document["user_id"],
        "filename": document["filename"],
        "raw_text": document["raw_text"],
        "extracted_skills": document.get("extracted_skills", []),
        "structured_resume": document.get("structured_resume", {}),
        "uploaded_at": document["uploaded_at"],
    }
