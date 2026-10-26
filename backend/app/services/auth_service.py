from typing import Any

from app.core.jwt import create_access_token
from app.core.security import hash_password, verify_password
from app.models.user_model import serialize_user
from app.repositories.user_repository import DuplicateUserError, UserRepository


class AuthError(Exception):
    pass


class EmailAlreadyRegisteredError(Exception):
    pass


class GoogleAccountConflictError(Exception):
    pass


class AuthService:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    async def register(self, name: str, email: str, password: str) -> dict[str, Any]:
        existing_user = await self.user_repository.get_by_email(email)
        if existing_user is not None:
            raise EmailAlreadyRegisteredError("A user with this email already exists.")

        try:
            user = await self.user_repository.create(
                name=name.strip(),
                email=email,
                password_hash=hash_password(password),
            )
        except DuplicateUserError as exc:
            raise EmailAlreadyRegisteredError("A user with this email already exists.") from exc

        serialized_user = serialize_user(user)
        return {
            "access_token": create_access_token(serialized_user["id"]),
            "token_type": "bearer",
            "user": serialized_user,
        }

    async def login(self, email: str, password: str) -> dict[str, Any]:
        user = await self.user_repository.get_by_email(email)
        if user is None or not user.get("password_hash") or not verify_password(password, user["password_hash"]):
            raise AuthError("Invalid email or password.")

        serialized_user = serialize_user(user)
        return {
            "access_token": create_access_token(serialized_user["id"]),
            "token_type": "bearer",
            "user": serialized_user,
        }

    async def login_with_google(self, identity: dict[str, Any]) -> dict[str, Any]:
        google_id = identity["google_id"]
        email = identity["email"].lower()
        user = await self.user_repository.get_by_google_id(google_id)

        if user is None:
            existing_email_user = await self.user_repository.get_by_email(email)
            if existing_email_user is not None:
                if not identity.get("email_authoritative", False):
                    raise GoogleAccountConflictError(
                        "This email already has an account. Sign in with its password before linking Google."
                    )
                existing_google_id = existing_email_user.get("google_id")
                if existing_google_id and existing_google_id != google_id:
                    raise GoogleAccountConflictError("This email is already linked to a different Google account.")
                user = await self.user_repository.link_google_account(email, google_id)
                if user is None:
                    raise GoogleAccountConflictError("This email could not be linked to the Google account.")
            else:
                try:
                    user = await self.user_repository.create_google_user(
                        name=identity["name"],
                        email=email,
                        google_id=google_id,
                    )
                except DuplicateUserError:
                    # A parallel Google sign-in may have created or linked this account.
                    user = await self.user_repository.get_by_google_id(google_id)
                    if user is None:
                        existing_email_user = await self.user_repository.get_by_email(email)
                        if (existing_email_user and not existing_email_user.get("google_id")
                                and identity.get("email_authoritative", False)):
                            user = await self.user_repository.link_google_account(email, google_id)
                    if user is None or user.get("google_id") != google_id:
                        raise GoogleAccountConflictError("This email is already linked to another account.")

        serialized_user = serialize_user(user)
        return {
            "access_token": create_access_token(serialized_user["id"]),
            "token_type": "bearer",
            "user": serialized_user,
        }

    async def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        user = await self.user_repository.get_by_id(user_id)
        if user is None:
            return None
        return serialize_user(user)
