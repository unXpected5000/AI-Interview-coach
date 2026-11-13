from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user_schema import UserResponse, _clean_name, _clean_phone


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    department: str = Field(min_length=1, max_length=100)
    year: int = Field(ge=1, le=10)
    phone: str | None = Field(default=None, max_length=32)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _clean_name(value)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        return _clean_phone(value)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=32, max_length=8192)


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    password: str = Field(min_length=1, max_length=128)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class VerificationPendingResponse(BaseModel):
    verification_required: bool = True
    message: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
