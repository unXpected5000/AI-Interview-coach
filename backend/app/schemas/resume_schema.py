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


class RecommendedRole(BaseModel):
    role: str
    match_score: float
    why_it_fits: str
    evidence_used: list[str]
    missing_skills: list[str]
    learning_roadmap: list[str]


class RoleRecommendationResponse(BaseModel):
    resume_id: str
    roles: list[RecommendedRole]
