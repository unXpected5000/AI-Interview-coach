import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_auth_service, get_current_user
from app.core.config import settings
from app.core.google_identity import (
    GoogleIdentityError,
    GoogleIdentityNotConfigured,
    verify_google_id_token,
)
from app.schemas.auth_schema import GoogleLoginRequest, LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user_schema import UserResponse
from app.services.auth_service import (
    AuthError,
    AuthService,
    EmailAlreadyRegisteredError,
    GoogleAccountConflictError,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    try:
        return await auth_service.register(
            name=payload.name,
            email=str(payload.email),
            password=payload.password,
        )
    except EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        ) from exc


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    try:
        return await auth_service.login(email=str(payload.email), password=payload.password)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        ) from exc


@router.post("/google", response_model=TokenResponse)
async def google_login(
    payload: GoogleLoginRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured. Set GOOGLE_CLIENT_ID on the backend.",
        )
    try:
        identity = await asyncio.to_thread(
            verify_google_id_token,
            payload.credential,
            settings.google_client_id,
        )
    except GoogleIdentityNotConfigured as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except GoogleIdentityError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google sign-in could not verify this account. Try again.",
        ) from exc

    try:
        return await auth_service.login_with_google(identity)
    except GoogleAccountConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/me", response_model=UserResponse)
async def me(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
    return current_user
