from datetime import datetime, timezone
from typing import Any


RESUME_OPTIMIZATIONS_COLLECTION = "resume_optimizations"


def build_resume_optimization_document(
    user_id: str,
    resume_id: str,
    target_role: str,
    company_name: str | None,
    job_description: str | None,
    cache_key: str,
    result: dict[str, Any],
) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "resume_id": resume_id,
        "target_role": target_role,
        "company_name": company_name,
        "job_description": job_description,
        "cache_key": cache_key,
        "result": result,
        "created_at": datetime.now(timezone.utc),
    }


def serialize_resume_optimization(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "user_id": document["user_id"],
        "resume_id": document["resume_id"],
        "target_role": document["target_role"],
        "company_name": document.get("company_name"),
        "job_description": document.get("job_description"),
        "cache_key": document.get("cache_key"),
        "result": document.get("result", {}),
        "created_at": document.get("created_at"),
    }
