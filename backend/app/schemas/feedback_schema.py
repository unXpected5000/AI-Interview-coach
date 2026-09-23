from pydantic import BaseModel
from pydantic import Field


class InterviewFeedback(BaseModel):
    overall_score: float
    strengths: list[str]
    weaknesses: list[str]
    recommendations: list[str]
    improvement_suggestions: list[str] = Field(default_factory=list)
    learning_roadmap: list[str] = Field(default_factory=list)
