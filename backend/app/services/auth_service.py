from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from typing import Any, Callable

from app.core.config import settings
from app.core.jwt import create_access_token
from app.core.security import hash_password, verify_password
from app.models.user_model import ROLE_OPERATOR, is_email_verified, serialize_user, user_role
from app.repositories.user_repository import DuplicateUserError, UserRepository
from app.services.email_service import EmailService
from app.services.profile_rules import normalize_department, validate_year

PENDING_MESSAGE = (
    "If this address can receive email, a 6-digit verification code has been sent. "
    "Enter it with your password to finish creating the account."
)
# Used to keep password checks for unknown accounts close in cost to real ones.
_DUMMY_PASSWORD_HASH = hash_password("timing-equalizer-password")


class AuthError(Exception):
    pass


class EmailAlreadyRegisteredError(Exception):
    pass


class GoogleAccountConflictError(Exception):
    pass


class EmailVerificationRequiredError(Exception):
    """Correct password, but the email address has not been verified yet."""


class InvalidVerificationError(Exception):
    pass


class VerificationThrottledError(Exception):
    pass


class ProfileValidationError(ValueError):
    pass


def _code_hash(user_id: str, code: str) -> str:
    if not settings.jwt_secret_key:
        raise RuntimeError("JWT_SECRET_KEY must be configured.")
    message = f"email-verification:{user_id}:{code}".encode("utf-8")
    return hmac.new(settings.jwt_secret_key.encode("utf-8"), message, hashlib.sha256).hexdigest()


class AuthService:
    def __init__(
        self,
        user_repository: UserRepository,
        email_service: EmailService | None = None,
        clock: Callable[[], float] = time.time,
    ):
        self.user_repository = user_repository
        self.email_service = email_service or EmailService()
        self.clock = clock

    # ----- password registration and verification -----

    async def register(
        self,
        name: str,
        email: str,
        password: str,
        department: str,
        year: int,
        phone: str | None = None,
    ) -> dict[str, Any]:
        try:
            department = normalize_department(department)
            year = validate_year(year)
        except ValueError as exc:
            raise ProfileValidationError(str(exc)) from exc
        # Fail before touching storage when no delivery channel exists.
        self.email_service.ensure_available()
        email = email.strip().lower()
        password_hash = hash_password(password)
        pending = {"verification_required": True, "message": PENDING_MESSAGE}

        existing = await self.user_repository.get_by_email(email)
        if existing is not None:
            if is_email_verified(existing) or existing.get("google_id"):
                # Do not reveal that the address already has an account.
                return pending
            if existing.get("email_verified") is not False:
                # Legacy password account: never rewrite its credentials or profile.
                # Send a code so the real owner can verify with their existing password.
                if existing.get("password_hash"):
                    await self._send_code_quietly(existing)
                return pending
            user = await self.user_repository.replace_pending_registration(
                str(existing["_id"]),
                {"name": name.strip(), "password_hash": password_hash, "department": department,
                 "year": year, "phone": phone, "email_verified": False},
            )
            if user is not None:
                await self._send_code_quietly(user)
            return pending

        try:
            user = await self.user_repository.create(
                name=name.strip(), email=email, password_hash=password_hash,
                department=department, year=year, phone=phone,
            )
        except DuplicateUserError:
            return pending
        await self._issue_code(user)
        return pending

    async def resend_verification(self, email: str) -> dict[str, Any]:
        self.email_service.ensure_available()
        user = await self.user_repository.get_by_email(email.strip().lower())
        if user is not None and user.get("password_hash") and not is_email_verified(user):
            await self._send_code_quietly(user)
        return {"verification_required": True, "message": PENDING_MESSAGE}

    async def verify_email(self, email: str, code: str, password: str) -> dict[str, Any]:
        user = await self.user_repository.get_by_email(email.strip().lower())
        if user is None or not user.get("password_hash") or is_email_verified(user):
            verify_password(password, _DUMMY_PASSWORD_HASH)
            raise InvalidVerificationError()
        user_id = str(user["_id"])
        verification = user.get("verification") or {}
        now = self.clock()
        if (
            not verification.get("code_hash")
            or float(verification.get("expires_at", 0)) <= now
            or int(verification.get("attempts", 0)) >= settings.email_verification_max_attempts
        ):
            verify_password(password, _DUMMY_PASSWORD_HASH)
            raise InvalidVerificationError()
        # Count the attempt before comparing so retries stay bounded.
        await self.user_repository.increment_verification_attempts(user_id)
        password_ok = verify_password(password, user["password_hash"])
        code_ok = hmac.compare_digest(_code_hash(user_id, code), str(verification["code_hash"]))
        if not (password_ok and code_ok):
            raise InvalidVerificationError()
        verified = await self.user_repository.mark_email_verified(user_id)
        if verified is None:
            raise InvalidVerificationError()
        return await self._session(verified)

    async def _send_code_quietly(self, user: dict[str, Any]) -> None:
        try:
            await self._issue_code(user)
        except VerificationThrottledError:
            pass

    async def _issue_code(self, user: dict[str, Any]) -> None:
        now = self.clock()
        verification = user.get("verification") or {}
        recent = [float(item) for item in verification.get("sent_at", []) if float(item) > now - 3600]
        cooldown = settings.email_verification_resend_cooldown_seconds
        if recent and now - recent[-1] < cooldown:
            raise VerificationThrottledError()
        if len(recent) >= settings.email_verification_max_sends_per_hour:
            raise VerificationThrottledError()
        user_id = str(user["_id"])
        code = f"{secrets.randbelow(1_000_000):06d}"
        ttl_minutes = settings.email_verification_code_ttl_minutes
        await self.user_repository.set_verification(
            user_id,
            {
                "code_hash": _code_hash(user_id, code),
                "expires_at": now + ttl_minutes * 60,
                "attempts": 0,
                "sent_at": [*recent, now][-settings.email_verification_max_sends_per_hour:],
            },
        )
        await self.email_service.send_verification_code(user["email"], code, ttl_minutes)

    # ----- sign-in -----

    async def login(self, email: str, password: str) -> dict[str, Any]:
        user = await self.user_repository.get_by_email(email)
        if user is None or not user.get("password_hash"):
            verify_password(password, _DUMMY_PASSWORD_HASH)
            raise AuthError("Invalid email or password.")
        if not verify_password(password, user["password_hash"]):
            raise AuthError("Invalid email or password.")
        if not is_email_verified(user):
            # Includes legacy password accounts: the code goes to the mailbox
            # owner, so knowing the password alone is not enough.
            self.email_service.ensure_available()
            await self._send_code_quietly(user)
            raise EmailVerificationRequiredError()
        return await self._session(user)

    async def login_with_google(self, identity: dict[str, Any]) -> dict[str, Any]:
        google_id = identity["google_id"]
        email = identity["email"].lower()
        user = await self.user_repository.get_by_google_id(google_id)

        if user is not None:
            if user.get("email_verified") is not True:
                # A legacy link to an unverified password registration: Google now
                # proves mailbox ownership, so drop the unverified password.
                user = await self.user_repository.mark_google_user_verified(
                    str(user["_id"]), remove_password=bool(user.get("password_hash"))
                ) or user
        else:
            existing_email_user = await self.user_repository.get_by_email(email)
            if existing_email_user is not None:
                user = await self._link_existing(existing_email_user, identity)
            else:
                try:
                    user = await self.user_repository.create_google_user(
                        name=identity["name"], email=email, google_id=google_id,
                    )
                except DuplicateUserError:
                    # A parallel Google sign-in may have created or linked this account.
                    user = await self.user_repository.get_by_google_id(google_id)
                    if user is None:
                        existing_email_user = await self.user_repository.get_by_email(email)
                        if existing_email_user is not None:
                            user = await self._link_existing(existing_email_user, identity)
                    if user is None or user.get("google_id") != google_id:
                        raise GoogleAccountConflictError("This email is already linked to another account.")

        return await self._session(user)

    async def _link_existing(self, existing: dict[str, Any], identity: dict[str, Any]) -> dict[str, Any]:
        google_id = identity["google_id"]
        if not identity.get("email_authoritative", False):
            raise GoogleAccountConflictError(
                "This email already has an account. Sign in with its password, or use a Google account "
                "whose address Google verifies as authoritative."
            )
        existing_google_id = existing.get("google_id")
        if existing_google_id and existing_google_id != google_id:
            raise GoogleAccountConflictError("This email is already linked to a different Google account.")
        verified_password_account = existing.get("email_verified") is True
        remove_password = bool(existing.get("password_hash")) and not verified_password_account
        user = await self.user_repository.link_google_account(
            identity["email"], google_id, remove_password=remove_password
        )
        if user is None:
            raise GoogleAccountConflictError("This email could not be linked to the Google account.")
        if existing.get("email_verified") is False:
            # A never-verified registration may have been created by someone else.
            # Discard its self-reported profile so the mailbox owner sets their own.
            user = await self.user_repository.update_fields(
                str(user["_id"]), {"name": identity["name"], "department": None, "year": None, "phone": None}
            ) or user
        return user

    async def _session(self, user: dict[str, Any]) -> dict[str, Any]:
        user = await self._apply_operator_bootstrap(user)
        serialized_user = serialize_user(user)
        return {
            "access_token": create_access_token(serialized_user["id"]),
            "token_type": "bearer",
            "user": serialized_user,
        }

    async def _apply_operator_bootstrap(self, user: dict[str, Any]) -> dict[str, Any]:
        email = str(user.get("email", "")).lower()
        if (
            email in settings.operator_email_set
            and is_email_verified(user)
            and user_role(user) != ROLE_OPERATOR
        ):
            return await self.user_repository.update_fields(str(user["_id"]), {"role": ROLE_OPERATOR}) or user
        return user

    async def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        user = await self.user_repository.get_by_id(user_id)
        if user is None or not is_email_verified(user):
            return None
        return serialize_user(user)
