from datetime import datetime, timezone
from typing import Any


USERS_COLLECTION = "users"

ROLE_STUDENT = "student"
ROLE_HOD = "department_faculty"
ROLE_OPERATOR = "operator"
ROLES = (ROLE_STUDENT, ROLE_HOD, ROLE_OPERATOR)


def build_user_document(
    name: str,
    email: str,
    password_hash: str | None,
    google_id: str | None = None,
    *,
    email_verified: bool = False,
    department: str | None = None,
    year: int | None = None,
    phone: str | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    # Every account starts as a student. Privileged roles are only assigned by an
    # operator action or the OPERATOR_EMAILS bootstrap after verification.
    return {
        "name": name,
        "email": email.lower(),
        "password_hash": password_hash,
        "google_id": google_id,
        "email_verified": email_verified,
        "role": ROLE_STUDENT,
        "department": department,
        "year": year,
        "phone": phone,
        "created_at": now,
        "updated_at": now,
    }


def user_role(document: dict[str, Any]) -> str:
    role = document.get("role")
    return role if role in ROLES else ROLE_STUDENT


def is_email_verified(document: dict[str, Any]) -> bool:
    if document.get("email_verified") is True:
        return True
    # Accounts created before verification existed by Google sign-in only were
    # verified by Google. Legacy password accounts must verify on next sign-in.
    return (
        "email_verified" not in document
        and bool(document.get("google_id"))
        and not document.get("password_hash")
    )


def is_profile_complete(document: dict[str, Any]) -> bool:
    role = user_role(document)
    if role == ROLE_STUDENT:
        return bool(document.get("department")) and isinstance(document.get("year"), int)
    if role == ROLE_HOD:
        return bool(document.get("department"))
    return True


def serialize_user(document: dict[str, Any]) -> dict[str, Any]:
    # Never include password hashes, Google subject IDs, or verification secrets.
    return {
        "id": str(document["_id"]),
        "name": document["name"],
        "email": document["email"],
        "role": user_role(document),
        "department": document.get("department"),
        "year": document.get("year"),
        "phone": document.get("phone"),
        "email_verified": is_email_verified(document),
        "profile_complete": is_profile_complete(document),
        "auth_methods": [
            method
            for method, present in (("password", document.get("password_hash")), ("google", document.get("google_id")))
            if present
        ],
        "created_at": document["created_at"],
        "updated_at": document["updated_at"],
    }
