from datetime import datetime

from pydantic import BaseModel


class ResumeResponse(BaseModel):
    id: str
    user_id: str
    filename: str
    extracted_skills: list[str]
    structured_resume: dict
    uploaded_at: datetime


class ResumeUploadResponse(ResumeResponse):
    pass


class ResumeListResponse(BaseModel):
    resumes: list[ResumeResponse]
