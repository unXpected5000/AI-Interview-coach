from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status

from app.api.deps import get_current_user, get_profile_complete_user, get_resume_service
from app.core.config import settings
from app.core.rate_limit import UPLOAD_USER, enforce
from app.schemas.resume_schema import ResumeListResponse, ResumeResponse, ResumeUploadResponse
from app.services.resume_service import ResumeService

router = APIRouter(prefix="/resumes", tags=["resumes"])

# Multipart framing (boundaries, headers, filename) adds a little to the file size.
MULTIPART_OVERHEAD_BYTES = 64 * 1024


def reject_oversized_upload(request: Request) -> None:
    """Refuse declared oversized bodies before the multipart parser reads them."""
    declared = request.headers.get("content-length")
    if declared is None:
        return
    try:
        length = int(declared)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Content-Length header.")
    if length > settings.max_resume_upload_mb * 1024 * 1024 + MULTIPART_OVERHEAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"PDF exceeds maximum size of {settings.max_resume_upload_mb} MB.",
        )


@router.post(
    "/upload",
    response_model=ResumeUploadResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(reject_oversized_upload)],
)
async def upload_resume(
    current_user: Annotated[dict, Depends(get_profile_complete_user)],
    resume_service: Annotated[ResumeService, Depends(get_resume_service)],
    file: Annotated[UploadFile, File(...)],
) -> dict:
    enforce(UPLOAD_USER, current_user["id"])
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
    return await resume_service.get_resume(resume_id, current_user["id"])
