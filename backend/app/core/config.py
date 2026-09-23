from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Interview Coach API"
    app_env: str = "development"
    api_prefix: str = "/api"
    backend_cors_origins: str = Field(default="http://localhost:5173")

    mongodb_uri: str = ""
    mongodb_db_name: str = "ai_interview_coach"

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60

    openai_api_key: str = ""
    gemini_api_key: str = ""
    llm_provider: str = "gemini"
    openai_model: str = "gpt-4o-mini"
    gemini_model: str = "gemini-1.5-flash"
    llm_timeout_seconds: int = 60

    sentence_transformers_model: str = "all-MiniLM-L6-v2"
    max_resume_upload_mb: int = 10

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.backend_cors_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
