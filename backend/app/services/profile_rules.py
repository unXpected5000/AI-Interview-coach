"""Validation shared by registration, profile completion, and staff edits."""
from __future__ import annotations

from app.core.config import settings


def normalize_department(value: str | None) -> str:
    name = " ".join(str(value or "").split())
    if not name:
        raise ValueError("Choose a department.")
    allowed = settings.department_list
    if not allowed:
        return name[:100]
    for option in allowed:
        if option.lower() == name.lower():
            return option
    raise ValueError("Choose a department from the configured list.")


def validate_year(value: int | None) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= settings.max_study_year:
        raise ValueError(f"Year must be between 1 and {settings.max_study_year}.")
    return value
