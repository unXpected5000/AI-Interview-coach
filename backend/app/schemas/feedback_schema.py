from pydantic import BaseModel, ConfigDict, Field


class InterviewFeedback(BaseModel):
    model_config = ConfigDict(extra="ignore")

    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    learning_roadmap: list[str] = Field(default_factory=list)
    feedback_by_dimension: dict[str, list[str]] = Field(default_factory=dict)
