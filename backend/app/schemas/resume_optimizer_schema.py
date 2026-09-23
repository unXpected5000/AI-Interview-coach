from datetime import datetime

from pydantic import BaseModel, Field


class ResumeOptimizerRequest(BaseModel):
    resume_id: str
    target_role: str = Field(min_length=2)
    company_name: str | None = None
    job_description: str | None = None


class ScoreCategory(BaseModel):
    score: float
    recommendations: list[str]


class ScoreBreakdown(BaseModel):
    ats_score: ScoreCategory
    project_quality: ScoreCategory
    technical_depth: ScoreCategory
    experience_strength: ScoreCategory
    impact_statements: ScoreCategory
    resume_structure: ScoreCategory


class ResumeOptimizationResult(BaseModel):
    score_breakdown: ScoreBreakdown
    strengths: list[str]
    gaps: list[str]
    suggested_keywords: list[str]
    rewritten_sections: dict
    optimized_summary: str


class ResumeOptimizationResponse(BaseModel):
    id: str
    user_id: str
    resume_id: str
    target_role: str
    company_name: str | None = None
    job_description: str | None = None
    cache_key: str
    result: ResumeOptimizationResult
    created_at: datetime
