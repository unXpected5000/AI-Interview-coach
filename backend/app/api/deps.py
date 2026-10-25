from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.jwt import decode_access_token
from app.db.mongodb import get_database
from app.repositories.answer_repository import AnswerRepository
from app.repositories.interview_repository import InterviewRepository
from app.repositories.resume_optimizer_repository import ResumeOptimizerRepository
from app.repositories.resume_repository import ResumeRepository
from app.repositories.score_repository import ScoreRepository
from app.repositories.user_repository import UserRepository
from app.services.evaluation_service import EvaluationService
from app.services.auth_service import AuthService
from app.services.feedback_service import FeedbackService
from app.services.interview_service import InterviewService
from app.services.question_service import QuestionService
from app.services.resume_optimizer_service import ResumeOptimizerService
from app.services.resume_parser_service import ResumeParserService
from app.services.resume_service import ResumeService
from app.services.skill_service import SkillService
from app.services.speech_service import SpeechService
from app.ai.llm_client import LLMClient

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_user_repository() -> UserRepository:
    return UserRepository(get_database())


def get_auth_service(
    user_repository: Annotated[UserRepository, Depends(get_user_repository)],
) -> AuthService:
    return AuthService(user_repository)


def get_resume_repository() -> ResumeRepository:
    return ResumeRepository(get_database())


def get_interview_repository() -> InterviewRepository:
    return InterviewRepository(get_database())


def get_resume_optimizer_repository() -> ResumeOptimizerRepository:
    return ResumeOptimizerRepository(get_database())


def get_answer_repository() -> AnswerRepository:
    return AnswerRepository(get_database())


def get_score_repository() -> ScoreRepository:
    return ScoreRepository(get_database())


def get_skill_service() -> SkillService:
    return SkillService()


def get_resume_parser_service() -> ResumeParserService:
    return ResumeParserService()


def get_speech_service() -> SpeechService:
    return SpeechService()


def get_llm_client() -> LLMClient:
    return LLMClient()


def get_question_service(
    llm_client: Annotated[LLMClient, Depends(get_llm_client)],
) -> QuestionService:
    return QuestionService(llm_client)


def get_evaluation_service() -> EvaluationService:
    return EvaluationService()


def get_feedback_service(
    llm_client: Annotated[LLMClient, Depends(get_llm_client)],
) -> FeedbackService:
    return FeedbackService(llm_client)


def get_resume_service(
    resume_repository: Annotated[ResumeRepository, Depends(get_resume_repository)],
    skill_service: Annotated[SkillService, Depends(get_skill_service)],
    resume_parser_service: Annotated[ResumeParserService, Depends(get_resume_parser_service)],
    llm_client: Annotated[LLMClient, Depends(get_llm_client)],
    interview_repository: Annotated[InterviewRepository, Depends(get_interview_repository)],
    answer_repository: Annotated[AnswerRepository, Depends(get_answer_repository)],
    score_repository: Annotated[ScoreRepository, Depends(get_score_repository)],
    optimizer_repository: Annotated[ResumeOptimizerRepository, Depends(get_resume_optimizer_repository)],
) -> ResumeService:
    return ResumeService(
        resume_repository,
        skill_service,
        resume_parser_service,
        llm_client,
        interview_repository,
        answer_repository,
        score_repository,
        optimizer_repository,
    )


def get_resume_optimizer_service(
    resume_repository: Annotated[ResumeRepository, Depends(get_resume_repository)],
    optimizer_repository: Annotated[ResumeOptimizerRepository, Depends(get_resume_optimizer_repository)],
    resume_parser_service: Annotated[ResumeParserService, Depends(get_resume_parser_service)],
    skill_service: Annotated[SkillService, Depends(get_skill_service)],
    llm_client: Annotated[LLMClient, Depends(get_llm_client)],
) -> ResumeOptimizerService:
    return ResumeOptimizerService(
        resume_repository=resume_repository,
        optimizer_repository=optimizer_repository,
        resume_parser_service=resume_parser_service,
        skill_service=skill_service,
        llm_client=llm_client,
    )


def get_interview_service(
    resume_repository: Annotated[ResumeRepository, Depends(get_resume_repository)],
    interview_repository: Annotated[InterviewRepository, Depends(get_interview_repository)],
    answer_repository: Annotated[AnswerRepository, Depends(get_answer_repository)],
    score_repository: Annotated[ScoreRepository, Depends(get_score_repository)],
    question_service: Annotated[QuestionService, Depends(get_question_service)],
    evaluation_service: Annotated[EvaluationService, Depends(get_evaluation_service)],
    feedback_service: Annotated[FeedbackService, Depends(get_feedback_service)],
    speech_service: Annotated[SpeechService, Depends(get_speech_service)],
) -> InterviewService:
    from app.services.report_service import ReportService
    report_service = ReportService()
    return InterviewService(
        resume_repository=resume_repository,
        interview_repository=interview_repository,
        answer_repository=answer_repository,
        score_repository=score_repository,
        question_service=question_service,
        evaluation_service=evaluation_service,
        feedback_service=feedback_service,
        speech_service=speech_service,
        report_service=report_service,
    )


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        user_id = decode_access_token(token)
    except (RuntimeError, ValueError):
        raise credentials_exception

    user = await auth_service.get_user_by_id(user_id)
    if user is None:
        raise credentials_exception

    return user
