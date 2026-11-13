from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.models.user_model import USERS_COLLECTION, build_user_document


class DuplicateUserError(Exception):
    pass


def _object_id(user_id: str) -> ObjectId | None:
    try:
        return ObjectId(user_id)
    except (InvalidId, TypeError):
        return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UserRepository:
    def __init__(self, database: AsyncIOMotorDatabase):
        self.collection = database[USERS_COLLECTION]

    async def create(
        self,
        name: str,
        email: str,
        password_hash: str,
        *,
        department: str | None = None,
        year: int | None = None,
        phone: str | None = None,
        verification: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        document = build_user_document(
            name=name, email=email, password_hash=password_hash,
            email_verified=False, department=department, year=year, phone=phone,
        )
        if verification is not None:
            document["verification"] = verification
        try:
            result = await self.collection.insert_one(document)
        except DuplicateKeyError as exc:
            raise DuplicateUserError("A user with this email already exists.") from exc

        created = await self.collection.find_one({"_id": result.inserted_id})
        if created is None:
            raise RuntimeError("Created user could not be loaded.")
        return created

    async def create_google_user(self, name: str, email: str, google_id: str) -> dict[str, Any]:
        document = build_user_document(
            name=name.strip(), email=email, password_hash=None, google_id=google_id, email_verified=True,
        )
        try:
            result = await self.collection.insert_one(document)
        except DuplicateKeyError as exc:
            raise DuplicateUserError("A user with this email or Google account already exists.") from exc

        created = await self.collection.find_one({"_id": result.inserted_id})
        if created is None:
            raise RuntimeError("Created Google user could not be loaded.")
        return created

    async def get_by_email(self, email: str) -> dict[str, Any] | None:
        return await self.collection.find_one({"email": email.lower()})

    async def get_by_google_id(self, google_id: str) -> dict[str, Any] | None:
        return await self.collection.find_one({"google_id": google_id})

    async def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        object_id = _object_id(user_id)
        if object_id is None:
            return None
        return await self.collection.find_one({"_id": object_id})

    async def replace_pending_registration(self, user_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
        """Overwrite a pending registration from the verification flow.

        Only documents explicitly marked ``email_verified: False`` qualify. Legacy
        accounts (no ``email_verified`` field) and verified accounts are never
        rewritten, so a re-registration cannot replace their credentials.
        """
        object_id = _object_id(user_id)
        if object_id is None:
            return None
        return await self.collection.find_one_and_update(
            {"_id": object_id, "email_verified": False, "google_id": {"$in": [None]}},
            {"$set": {**values, "updated_at": _now()}},
            return_document=ReturnDocument.AFTER,
        )

    async def set_verification(self, user_id: str, verification: dict[str, Any]) -> None:
        await self.collection.update_one({"_id": ObjectId(user_id)}, {"$set": {"verification": verification}})

    async def increment_verification_attempts(self, user_id: str) -> None:
        await self.collection.update_one({"_id": ObjectId(user_id)}, {"$inc": {"verification.attempts": 1}})

    async def clear_verification(self, user_id: str) -> None:
        await self.collection.update_one({"_id": ObjectId(user_id)}, {"$unset": {"verification": ""}})

    async def mark_email_verified(self, user_id: str) -> dict[str, Any] | None:
        return await self.collection.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": {"email_verified": True, "updated_at": _now()}, "$unset": {"verification": ""}},
            return_document=ReturnDocument.AFTER,
        )

    async def link_google_account(
        self,
        email: str,
        google_id: str,
        *,
        remove_password: bool = False,
    ) -> dict[str, Any] | None:
        """Attach a Google identity and mark the email verified by Google.

        When ``remove_password`` is set, the existing password is discarded so a
        party who registered the address without verifying it cannot keep access.
        """
        updates: dict[str, Any] = {"$set": {"google_id": google_id, "email_verified": True, "updated_at": _now()},
                                   "$unset": {"verification": ""}}
        if remove_password:
            updates["$set"]["password_hash"] = None
            updates["$set"]["password_removed_at"] = _now()
        try:
            await self.collection.update_one(
                {
                    "email": email.lower(),
                    "$or": [
                        {"google_id": {"$exists": False}},
                        {"google_id": None},
                        {"google_id": google_id},
                    ],
                },
                updates,
            )
        except DuplicateKeyError:
            return None
        user = await self.get_by_email(email)
        return user if user and user.get("google_id") == google_id else None

    async def mark_google_user_verified(self, user_id: str, *, remove_password: bool) -> dict[str, Any] | None:
        updates: dict[str, Any] = {"$set": {"email_verified": True, "updated_at": _now()}, "$unset": {"verification": ""}}
        if remove_password:
            updates["$set"]["password_hash"] = None
            updates["$set"]["password_removed_at"] = _now()
        return await self.collection.find_one_and_update(
            {"_id": ObjectId(user_id)}, updates, return_document=ReturnDocument.AFTER
        )

    async def update_fields(self, user_id: str, values: dict[str, Any]) -> dict[str, Any] | None:
        object_id = _object_id(user_id)
        if object_id is None:
            return None
        return await self.collection.find_one_and_update(
            {"_id": object_id},
            {"$set": {**values, "updated_at": _now()}},
            return_document=ReturnDocument.AFTER,
        )

    async def count(self, query: dict[str, Any]) -> int:
        return await self.collection.count_documents(query)

    async def list_users(self, query: dict[str, Any], skip: int, limit: int) -> list[dict[str, Any]]:
        cursor = self.collection.find(
            query,
            {"verification": 0},
        ).sort([("name", 1), ("_id", 1)]).skip(skip).limit(limit)
        return await cursor.to_list(length=limit)
