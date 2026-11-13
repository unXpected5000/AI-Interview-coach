"""Profile completion, HOD department views, and operator administration."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user, get_user_management_service, require_hod, require_operator
from app.core.config import settings
from app.schemas.user_schema import (
    ManagedUser,
    ManagedUserListResponse,
    ProfileOptionsResponse,
    ProfileUpdateRequest,
    RoleUpdateRequest,
    StaffStudentUpdateRequest,
    StudentProgressResponse,
    UserResponse,
)
from app.services.user_management_service import MAX_PAGE_SIZE, UserManagementService

router = APIRouter(tags=["users"])

Service = Annotated[UserManagementService, Depends(get_user_management_service)]
Page = Annotated[int, Query(ge=1, le=10_000)]
PageSize = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Search = Annotated[str | None, Query(max_length=100)]


@router.get("/meta/profile-options", response_model=ProfileOptionsResponse)
async def profile_options() -> dict:
    return {"departments": settings.department_list, "max_year": settings.max_study_year}


@router.patch("/users/me", response_model=UserResponse)
async def update_my_profile(
    payload: ProfileUpdateRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
    service: Service,
) -> dict:
    return await service.update_own_profile(current_user, payload)


# ----- HOD (department_faculty): own department students only -----

@router.get("/department/students", response_model=ManagedUserListResponse)
async def list_department_students(
    hod: Annotated[dict, Depends(require_hod)],
    service: Service,
    q: Search = None,
    page: Page = 1,
    page_size: PageSize = 25,
) -> dict:
    return await service.list_department_students(hod, q, page, page_size)


@router.get("/department/students/{student_id}", response_model=StudentProgressResponse)
async def department_student_progress(
    student_id: str,
    hod: Annotated[dict, Depends(require_hod)],
    service: Service,
) -> dict:
    return await service.department_student_progress(hod, student_id)


@router.patch("/department/students/{student_id}", response_model=ManagedUser)
async def update_department_student(
    student_id: str,
    payload: StaffStudentUpdateRequest,
    hod: Annotated[dict, Depends(require_hod)],
    service: Service,
) -> dict:
    return await service.update_department_student(hod, student_id, payload)


# ----- Operator: application-wide administration -----

@router.get("/admin/users", response_model=ManagedUserListResponse)
async def admin_list_users(
    _operator: Annotated[dict, Depends(require_operator)],
    service: Service,
    role: Annotated[str | None, Query(max_length=40)] = None,
    department: Annotated[str | None, Query(max_length=100)] = None,
    q: Search = None,
    page: Page = 1,
    page_size: PageSize = 25,
) -> dict:
    return await service.list_users(role, department, q, page, page_size)


@router.get("/admin/users/{user_id}", response_model=StudentProgressResponse)
async def admin_user_progress(
    user_id: str,
    _operator: Annotated[dict, Depends(require_operator)],
    service: Service,
) -> dict:
    return await service.user_progress(user_id)


@router.patch("/admin/users/{user_id}", response_model=ManagedUser)
async def admin_update_user(
    user_id: str,
    payload: StaffStudentUpdateRequest,
    _operator: Annotated[dict, Depends(require_operator)],
    service: Service,
) -> dict:
    return await service.update_user_profile(user_id, payload)


@router.put("/admin/users/{user_id}/role", response_model=ManagedUser)
async def admin_set_role(
    user_id: str,
    payload: RoleUpdateRequest,
    operator: Annotated[dict, Depends(require_operator)],
    service: Service,
) -> dict:
    return await service.set_role(operator, user_id, payload)
