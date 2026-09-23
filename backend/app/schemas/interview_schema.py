from datetime import datetime

from pydantic import BaseModel, Field


class InterviewQuestion(BaseModel):
    question_id: int
    skill: str
    difficulty: str
    question_type: str = "conceptual"
    topic_focus: str = ""
    source_section: str = ""
    question: str
    expected_answer: str
    expected_points: list[str] = Field(default_factory=list)
    key_points: list[str] = Field(default_factory=list)


class InterviewResponse(BaseModel):
    id: str
    user_id: str
    resume_id: str
    skills: list[str]
    questions: list[InterviewQuestion]
    status: str
    created_at: datetime
    completed_at: datetime | None = None


class InterviewStartRequest(BaseModel):
    resume_id: str


class InterviewStartResponse(BaseModel):
    interview: InterviewResponse


class AnswerCreateRequest(BaseModel):
    question_id: int
    answer_text: str = Field(min_length=1)
    transcript: str | None = None
    speech_analysis: dict | None = None
    webcam_metrics: dict | None = None


class AnswerResponse(BaseModel):
    id: str
    user_id: str
    interview_id: str
    question_id: int
    answer_text: str
    transcript: str
    semantic_score: float
    communication_score: float = 0
    score: float | None = None
    completeness_score: float | None = None
    relevance_score: float | None = None
    matched_points: list[str] = Field(default_factory=list)
    missing_points: list[str] = Field(default_factory=list)
    evaluation: dict | None = None
    speech_analysis: dict | None = None
    webcam_metrics: dict | None = None
    answered_at: datetime
    updated_at: datetime


class InterviewStateResponse(BaseModel):
    interview: InterviewResponse
    answers: list[AnswerResponse]
    score: dict | None = None
    webcam_summary: dict | None = None


class CompleteInterviewResponse(BaseModel):
    interview: InterviewResponse
    overall_score: float
    communication_score: float = 0
    strengths: list[str]
    weaknesses: list[str]
    recommendations: list[str]
    improvement_suggestions: list[str] = Field(default_factory=list)
    learning_roadmap: list[str] = Field(default_factory=list)


class InterviewSummary(BaseModel):
    id: str
    resume_id: str
    skills: list[str]
    status: str
    question_count: int
    created_at: datetime
    completed_at: datetime | None = None
    overall_score: float | None = None
    communication_score: float | None = None
    question_scores: list[dict] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)


class InterviewListResponse(BaseModel):
    interviews: list[InterviewSummary]
