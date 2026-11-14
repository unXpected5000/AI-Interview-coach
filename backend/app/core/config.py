from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Interview Coach API"
    app_env: str = "development"
    api_prefix: str = "/api"
    backend_cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173"
    )

    mongodb_uri: str = ""
    mongodb_db_name: str = "ai_interview_coach"

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    google_client_id: str = ""

    openai_api_key: str = ""
    gemini_api_key: str = ""
    llm_provider: str = "gemini"
    openai_model: str = "gpt-4o-mini"
    gemini_model: str = "gemini-3.1-flash-lite"
    llm_timeout_seconds: int = 30

    # Retained so older local .env files continue to load. The backend no
    # longer downloads or runs this model on memory-constrained deployments.
    sentence_transformers_model: str = "all-MiniLM-L6-v2"

    max_resume_upload_mb: int = 10
    max_resume_pdf_pages: int = Field(default=40, ge=1, le=500)

    # Email verification. Codes are delivered through SMTP only; nothing is sent
    # when SMTP is unset, and registration fails with a clear 503 instead.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_use_starttls: bool = True
    smtp_use_ssl: bool = False
    smtp_timeout_seconds: float = 10.0
    # Development-only escape hatch: log codes to the server console instead of
    # emailing them. Ignored unless APP_ENV is "development".
    email_dev_log_codes: bool = False
    email_verification_code_ttl_minutes: int = Field(default=15, ge=1, le=120)
    email_verification_max_attempts: int = Field(default=5, ge=1, le=20)
    email_verification_resend_cooldown_seconds: int = Field(default=60, ge=0, le=3600)
    email_verification_max_sends_per_hour: int = Field(default=5, ge=1, le=50)

    # Comma-separated verified email addresses that are promoted to operator on
    # sign-in. There is no hardcoded default.
    operator_emails: str = ""
    # Comma-separated department names offered to students and staff.
    departments: str = "AI and DS,Comps,IT,Mechatronics,ELX,EXTC,Mech,Civil"
    max_study_year: int = Field(default=4, ge=1, le=10)

    # In-memory, single-process limits. They reset on restart and are not shared
    # between instances. Set a header name only when the API is reachable solely
    # through a proxy that overwrites it (for example "cf-connecting-ip").
    rate_limit_enabled: bool = True
    rate_limit_max_keys: int = Field(default=20000, ge=100, le=1_000_000)
    rate_limit_client_ip_header: str = ""

    readiness_developing_threshold: int = Field(default=20, ge=0, le=100)
    readiness_moderate_threshold: int = Field(default=40, ge=0, le=100)
    readiness_good_progress_threshold: int = Field(default=60, ge=0, le=100)
    readiness_strong_threshold: int = Field(default=80, ge=0, le=100)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @model_validator(mode="after")
    def validate_readiness_thresholds(self):
        thresholds = [self.readiness_developing_threshold, self.readiness_moderate_threshold,
                      self.readiness_good_progress_threshold, self.readiness_strong_threshold]
        if thresholds != sorted(thresholds) or len(set(thresholds)) != len(thresholds):
            raise ValueError("Readiness thresholds must be strictly increasing.")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [
            # Browsers send origins without a trailing slash; tolerate one in config.
            origin.strip().rstrip("/")
            for origin in self.backend_cors_origins.split(",")
            if origin.strip().rstrip("/")
        ]

    @property
    def operator_email_set(self) -> set[str]:
        return {item.strip().lower() for item in self.operator_emails.split(",") if item.strip()}

    @property
    def department_list(self) -> list[str]:
        seen: dict[str, str] = {}
        for item in self.departments.split(","):
            name = " ".join(item.split())
            if name and name.lower() not in seen:
                seen[name.lower()] = name
        return list(seen.values())

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host.strip() and self.smtp_from_email.strip())

    @property
    def email_dev_logging_active(self) -> bool:
        return self.email_dev_log_codes and self.app_env.strip().lower() == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
