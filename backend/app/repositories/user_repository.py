from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.models.user_model import USERS_COLLECTION, build_user_document


class DuplicateUserError(Exception):
    pass


class UserRepository:
    def __init__(self, database: AsyncIOMotorDatabase):
        self.collection = database[USERS_COLLECTION]

    async def create(self, name: str, email: str, password_hash: str) -> dict[str, Any]:
        document = build_user_document(name=name, email=email, password_hash=password_hash)
        try:
            result = await self.collection.insert_one(document)
        except DuplicateKeyError as exc:
            raise DuplicateUserError("A user with this email already exists.") from exc

        created = await self.collection.find_one({"_id": result.inserted_id})
        if created is None:
            raise RuntimeError("Created user could not be loaded.")
        return created

    async def get_by_email(self, email: str) -> dict[str, Any] | None:
        return await self.collection.find_one({"email": email.lower()})

    async def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        try:
            object_id = ObjectId(user_id)
        except InvalidId:
            return None
        return await self.collection.find_one({"_id": object_id})
