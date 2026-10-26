from datetime import datetime, timezone
from typing import Any


USERS_COLLECTION = "users"


def build_user_document(
    name: str,
    email: str,
    password_hash: str | None,
    google_id: str | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "name": name,
        "email": email.lower(),
        "password_hash": password_hash,
        "google_id": google_id,
        "created_at": now,
        "updated_at": now,
    }


def serialize_user(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "name": document["name"],
        "email": document["email"],
        "created_at": document["created_at"],
        "updated_at": document["updated_at"],
    }
