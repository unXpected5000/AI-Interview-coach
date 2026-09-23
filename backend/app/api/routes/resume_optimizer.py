from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user, get_resume_optimizer_service
from app.schemas.resume_optimizer_schema import ResumeOptimizationResponse, ResumeOptimizerRequest
from app.services.resume_optimizer_service import ResumeOptimizerService

router = APIRouter(prefix="/resume-optimizer", tags=["resume-optimizer"])


@router.post("/analyze", response_model=ResumeOptimizationResponse, status_code=status.HTTP_201_CREATED)
async def analyze_resume(
    payload: ResumeOptimizerRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
    resume_optimizer_service: Annotated[ResumeOptimizerService, Depends(get_resume_optimizer_service)],
) -> dict:
    return await resume_optimizer_service.optimize_resume(
        user_id=current_user["id"],
        resume_id=payload.resume_id,
        target_role=payload.target_role,
        company_name=payload.company_name,
        job_description=payload.job_description,
    )
