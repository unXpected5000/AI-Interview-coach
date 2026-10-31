from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import get_current_user, get_interview_service
from app.schemas.interview_schema import (
    AnswerCreateRequest,
    AnswerResponse,
    CompleteInterviewResponse,
    InterviewListResponse,
    InterviewStateResponse,
    InterviewStartRequest,
    InterviewStartResponse,
)
from app.services.interview_service import InterviewService

router = APIRouter(prefix="/interviews", tags=["interviews"])


@router.delete("/{interview_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_interview(
    interview_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    interview_service: Annotated[InterviewService, Depends(get_interview_service)],
) -> Response:
    await interview_service.delete_interview(interview_id, current_user["id"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/start", response_model=InterviewStartResponse, status_code=status.HTTP_201_CREATED)
async def start_interview(
    payload: InterviewStartRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
    interview_service: Annotated[InterviewService, Depends(get_interview_service)],
) -> dict:
    interview = await interview_service.start_interview(current_user["id"], payload.resume_id, payload.difficulty, payload.difficulty_mode)
    return {"interview": interview}


@router.get("/{interview_id}", response_model=InterviewStateResponse)
async def get_interview(
    interview_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    interview_service: Annotated[InterviewService, Depends(get_interview_service)],
) -> dict:
    return await interview_service.get_interview(interview_id, current_user["id"])


@router.get("", response_model=InterviewListResponse)
async def list_interviews(
    current_user: Annotated[dict, Depends(get_current_user)],
    interview_service: Annotated[InterviewService, Depends(get_interview_service)],
) -> dict:
    interviews = await interview_service.list_interviews(current_user["id"])
    return {"interviews": interviews}


@router.post("/{interview_id}/answer", response_model=AnswerResponse)
async def submit_answer(
    interview_id: str,
    payload: AnswerCreateRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
    interview_service: Annotated[InterviewService, Depends(get_interview_service)],
) -> dict:
    return await interview_service.submit_answer(
        interview_id=interview_id,
        user_id=current_user["id"],
        question_id=payload.question_id,
        answer_text=payload.answer_text,
        transcript=payload.transcript,
        speech_metadata=payload.speech_metadata,
        webcam_metrics=payload.webcam_metrics,
        answer_status=payload.answer_status,
    )


@router.post("/{interview_id}/complete", response_model=CompleteInterviewResponse)
async def complete_interview(
    interview_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    interview_service: Annotated[InterviewService, Depends(get_interview_service)],
) -> dict:
    return await interview_service.complete_interview(interview_id, current_user["id"])
