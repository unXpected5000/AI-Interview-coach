from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

RoleName = Literal["student", "department_faculty", "operator"]


def _clean_name(value: str) -> str:
    stripped = " ".join(value.split())
    if len(stripped) < 2:
        raise ValueError("Name must contain at least 2 non-space characters.")
    return stripped


def _clean_phone(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    allowed = set("0123456789+-() ")
    if any(char not in allowed for char in stripped) or sum(char.isdigit() for char in stripped) < 7:
        raise ValueError("Enter a valid phone number.")
    return stripped


class UserResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: RoleName = "student"
    department: str | None = None
    year: int | None = None
    phone: str | None = None
    email_verified: bool = False
    profile_complete: bool = False
    auth_methods: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ProfileUpdateRequest(BaseModel):
    """Fields a user may change on their own profile."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    phone: str | None = Field(default=None, max_length=32)
    # Students may set department and year only while they are missing.
    department: str | None = Field(default=None, max_length=100)
    year: int | None = Field(default=None, ge=1, le=10)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        return _clean_name(value) if value is not None else None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        return _clean_phone(value)


class StaffStudentUpdateRequest(BaseModel):
    """Profile fields an HOD or operator may edit. Never role, email, or records."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    phone: str | None = Field(default=None, max_length=32)
    department: str | None = Field(default=None, max_length=100)
    year: int | None = Field(default=None, ge=1, le=10)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        return _clean_name(value) if value is not None else None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        return _clean_phone(value)


class RoleUpdateRequest(BaseModel):
    role: RoleName
    department: str | None = Field(default=None, max_length=100)


class ProfileOptionsResponse(BaseModel):
    departments: list[str]
    max_year: int


class StudentProgress(BaseModel):
    interviews_started: int = 0
    interviews_completed: int = 0
    average_score: float | None = None
    latest_score: float | None = None
    latest_readiness: str | None = None
    last_activity_at: datetime | None = None


class ManagedUser(UserResponse):
    progress: StudentProgress | None = None


class ManagedUserListResponse(BaseModel):
    users: list[ManagedUser]
    total: int
    page: int
    page_size: int


class StudentInterviewSummary(BaseModel):
    id: str
    status: str
    created_at: datetime
    completed_at: datetime | None = None
    question_count: int = 0
    performance_score: float | None = None
    readiness_category: str | None = None
    completion_percentage: float = 0
    assessment_reliability: str | None = None
    difficulty: dict = Field(default_factory=dict)


class StudentProgressResponse(BaseModel):
    student: ManagedUser
    interviews: list[StudentInterviewSummary]
