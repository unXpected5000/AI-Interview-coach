import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.deps import get_auth_service, get_current_user
from app.core import rate_limit
from app.core.config import settings
from app.core.google_identity import (
    GoogleIdentityError,
    GoogleIdentityNotConfigured,
    GoogleIdentityVerificationUnavailable,
    verify_google_id_token,
)
from app.schemas.auth_schema import (
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    ResendVerificationRequest,
    TokenResponse,
    VerificationPendingResponse,
    VerifyEmailRequest,
)
from app.schemas.user_schema import UserResponse
from app.services.auth_service import (
    AuthError,
    AuthService,
    EmailVerificationRequiredError,
    GoogleAccountConflictError,
    InvalidVerificationError,
    ProfileValidationError,
)
from app.services.email_service import EmailDeliveryError, EmailNotConfiguredError

router = APIRouter(prefix="/auth", tags=["auth"])


def _email_unavailable(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


@router.post("/register", response_model=VerificationPendingResponse, status_code=status.HTTP_202_ACCEPTED)
async def register(
    payload: RegisterRequest,
    request: Request,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict:
    rate_limit.enforce(rate_limit.REGISTER_IP, rate_limit.client_ip(request))
    rate_limit.enforce(rate_limit.REGISTER_EMAIL, str(payload.email))
    try:
        return await auth_service.register(
            name=payload.name,
            email=str(payload.email),
            password=payload.password,
            department=payload.department,
            year=payload.year,
            phone=payload.phone,
        )
    except ProfileValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except (EmailNotConfiguredError, EmailDeliveryError) as exc:
        raise _email_unavailable(exc) from exc


@router.post("/verify-email", response_model=TokenResponse)
async def verify_email(
    payload: VerifyEmailRequest,
    request: Request,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict:
    rate_limit.enforce(rate_limit.VERIFY_IP, rate_limit.client_ip(request))
    rate_limit.enforce(rate_limit.VERIFY_EMAIL, str(payload.email))
    try:
        return await auth_service.verify_email(str(payload.email), payload.code, payload.password)
    except InvalidVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The verification code, email, or password is incorrect, or the code has expired. Request a new code if needed.",
        ) from exc


@router.post("/resend-verification", response_model=VerificationPendingResponse, status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(
    payload: ResendVerificationRequest,
    request: Request,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict:
    rate_limit.enforce(rate_limit.RESEND_IP, rate_limit.client_ip(request))
    rate_limit.enforce(rate_limit.RESEND_EMAIL, str(payload.email))
    try:
        return await auth_service.resend_verification(str(payload.email))
    except (EmailNotConfiguredError, EmailDeliveryError) as exc:
        raise _email_unavailable(exc) from exc


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict:
    rate_limit.enforce(rate_limit.LOGIN_IP, rate_limit.client_ip(request))
    rate_limit.enforce(rate_limit.LOGIN_EMAIL, str(payload.email))
    try:
        return await auth_service.login(email=str(payload.email), password=payload.password)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        ) from exc
    except EmailVerificationRequiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "email_verification_required",
                "message": "Verify your email address to sign in. If allowed, a new code was sent to your inbox.",
            },
        ) from exc
    except (EmailNotConfiguredError, EmailDeliveryError) as exc:
        raise _email_unavailable(exc) from exc


@router.post("/google", response_model=TokenResponse)
async def google_login(
    payload: GoogleLoginRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    request: Request = None,
) -> dict:
    rate_limit.enforce(rate_limit.GOOGLE_IP, rate_limit.client_ip(request))
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
    except GoogleIdentityVerificationUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in verification is temporarily unavailable. Please retry.",
            headers={"Retry-After": "2"},
        ) from exc
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
