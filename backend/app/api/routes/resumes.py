from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status

from app.api.deps import get_current_user, get_resume_service
from app.schemas.resume_schema import ResumeListResponse, ResumeResponse, ResumeUploadResponse, RoleRecommendationResponse
from app.services.resume_service import ResumeService

router = APIRouter(prefix="/resumes", tags=["resumes"])


@router.post("/upload", response_model=ResumeUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    current_user: Annotated[dict, Depends(get_current_user)],
    resume_service: Annotated[ResumeService, Depends(get_resume_service)],
    file: Annotated[UploadFile, File(...)],
) -> dict:
    return await resume_service.upload_resume(current_user["id"], file)


@router.get("", response_model=ResumeListResponse)
async def list_resumes(
    current_user: Annotated[dict, Depends(get_current_user)],
    resume_service: Annotated[ResumeService, Depends(get_resume_service)],
) -> dict:
    resumes = await resume_service.list_resumes(current_user["id"])
    return {"resumes": resumes}


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    resume_service: Annotated[ResumeService, Depends(get_resume_service)],
) -> Response:
    await resume_service.delete_resume(resume_id, current_user["id"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    resume_service: Annotated[ResumeService, Depends(get_resume_service)],
) -> dict:
    resume = await resume_service.get_resume(resume_id, current_user["id"])
    return resume


@router.get("/{resume_id}/roles", response_model=RoleRecommendationResponse)
async def recommend_roles(
    resume_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    resume_service: Annotated[ResumeService, Depends(get_resume_service)],
) -> dict:
    return await resume_service.recommend_roles(resume_id, current_user["id"])
