"""A small in-memory stand-in for the Motor collection methods the app uses.

It supports the query/update operators exercised by the repositories under test;
it is not a general MongoDB emulator.
"""
from __future__ import annotations

import copy
import re
from types import SimpleNamespace
from typing import Any

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

_MISSING = object()


def _get(document: Any, path: str) -> Any:
    current = document
    for part in path.split("."):
        if isinstance(current, list):
            values = [_get(item, part) for item in current if isinstance(item, dict)]
            return [value for value in values if value is not _MISSING]
        if not isinstance(current, dict) or part not in current:
            return _MISSING
        current = current[part]
    return current


def _match_value(value: Any, condition: Any) -> bool:
    if isinstance(condition, dict) and any(key.startswith("$") for key in condition):
        for operator, operand in condition.items():
            if operator == "$in":
                candidates = value if isinstance(value, list) else [None if value is _MISSING else value]
                if not any(item in operand for item in candidates):
                    return False
            elif operator == "$ne":
                if isinstance(value, list):
                    if operand in value:
                        return False
                elif value is not _MISSING and value == operand:
                    return False
            elif operator == "$exists":
                if (value is not _MISSING) != bool(operand):
                    return False
            elif operator == "$regex":
                flags = re.IGNORECASE if "i" in condition.get("$options", "") else 0
                if value is _MISSING or not re.search(operand, str(value), flags):
                    return False
            elif operator == "$options":
                continue
            else:
                raise NotImplementedError(operator)
        return True
    if isinstance(value, list) and not isinstance(condition, list):
        return condition in value
    if value is _MISSING:
        return condition is None
    return value == condition


def matches(document: dict, query: dict) -> bool:
    for key, condition in query.items():
        if key == "$or":
            if not any(matches(document, clause) for clause in condition):
                return False
        elif key == "$and":
            if not all(matches(document, clause) for clause in condition):
                return False
        elif not _match_value(_get(document, key), condition):
            return False
    return True


def _set_path(document: dict, path: str, value: Any) -> None:
    parts = path.split(".")
    current = document
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = value


def _unset_path(document: dict, path: str) -> None:
    parts = path.split(".")
    current = document
    for part in parts[:-1]:
        current = current.get(part, {})
    if isinstance(current, dict):
        current.pop(parts[-1], None)


def _project(document: dict, projection: dict | None) -> dict:
    if not projection:
        return copy.deepcopy(document)
    excluded = [key for key, value in projection.items() if not value]
    if excluded and len(excluded) == len(projection):
        result = copy.deepcopy(document)
        for key in excluded:
            _unset_path(result, key)
        return result
    result: dict = {"_id": document.get("_id")}
    for key in projection:
        top = key.split(".")[0]
        if top in document:
            result[top] = copy.deepcopy(document[top])
    return result


class Cursor:
    def __init__(self, rows: list[dict]):
        self.rows = rows

    def sort(self, key, direction=None):
        keys = key if isinstance(key, list) else [(key, direction or 1)]
        for field, order in reversed(keys):
            present = [row for row in self.rows if row.get(field) is not None]
            missing = [row for row in self.rows if row.get(field) is None]
            present.sort(key=lambda row: row[field], reverse=order == -1)
            self.rows = present + missing
        return self

    def skip(self, count):
        self.rows = self.rows[count:]
        return self

    def limit(self, count):
        self.rows = self.rows[:count]
        return self

    async def to_list(self, length=None):
        return self.rows if length is None else self.rows[:length]

    def __aiter__(self):
        self._iterator = iter(self.rows)
        return self

    async def __anext__(self):
        try:
            return next(self._iterator)
        except StopIteration:
            raise StopAsyncIteration


class FakeCollection:
    def __init__(self, unique: tuple[str, ...] = ()):
        self.documents: list[dict] = []
        self.unique = unique

    def _check_unique(self, candidate: dict, ignore_id=None) -> None:
        for field in self.unique:
            value = candidate.get(field)
            if value is None:
                continue
            for document in self.documents:
                if document["_id"] != ignore_id and document.get(field) == value:
                    raise DuplicateKeyError(f"duplicate {field}")

    async def insert_one(self, document: dict):
        document = copy.deepcopy(document)
        document.setdefault("_id", ObjectId())
        self._check_unique(document)
        self.documents.append(document)
        return SimpleNamespace(inserted_id=document["_id"])

    async def find_one(self, query: dict, projection: dict | None = None, sort=None):
        rows = [document for document in self.documents if matches(document, query)]
        if sort:
            rows = Cursor(rows).sort(sort).rows
        return _project(rows[0], projection) if rows else None

    def find(self, query: dict | None = None, projection: dict | None = None):
        return Cursor([_project(document, projection) for document in self.documents if matches(document, query or {})])

    async def count_documents(self, query: dict):
        return sum(1 for document in self.documents if matches(document, query))

    def _apply(self, document: dict, update: dict) -> None:
        candidate = copy.deepcopy(document)
        for path, value in update.get("$set", {}).items():
            _set_path(candidate, path, copy.deepcopy(value))
        for path in update.get("$unset", {}):
            _unset_path(candidate, path)
        for path, amount in update.get("$inc", {}).items():
            current = _get(candidate, path)
            _set_path(candidate, path, (0 if current is _MISSING else current) + amount)
        for path, value in update.get("$push", {}).items():
            current = _get(candidate, path)
            items = [] if current is _MISSING else list(current)
            items.extend(value["$each"] if isinstance(value, dict) and "$each" in value else [value])
            _set_path(candidate, path, items)
        self._check_unique(candidate, ignore_id=document["_id"])
        document.clear()
        document.update(candidate)

    async def update_one(self, query: dict, update: dict, upsert: bool = False, array_filters=None):
        for document in self.documents:
            if matches(document, query):
                self._apply(document, update)
                return SimpleNamespace(modified_count=1, matched_count=1)
        if upsert:
            base = {key: value for key, value in query.items() if not key.startswith("$")}
            await self.insert_one(base)
            self._apply(self.documents[-1], update)
        return SimpleNamespace(modified_count=0, matched_count=0)

    async def find_one_and_update(self, query: dict, update: dict, return_document=None):
        for document in self.documents:
            if matches(document, query):
                self._apply(document, update)
                return copy.deepcopy(document)
        return None

    async def delete_many(self, query: dict):
        before = len(self.documents)
        self.documents = [document for document in self.documents if not matches(document, query)]
        return SimpleNamespace(deleted_count=before - len(self.documents))

    async def delete_one(self, query: dict):
        for index, document in enumerate(self.documents):
            if matches(document, query):
                del self.documents[index]
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)


class FakeDatabase:
    def __init__(self):
        self.collections = {
            "users": FakeCollection(unique=("email", "google_id")),
        }

    def __getitem__(self, name: str) -> FakeCollection:
        return self.collections.setdefault(name, FakeCollection())

    def __getattr__(self, name: str) -> FakeCollection:
        if name.startswith("_") or name == "collections":
            raise AttributeError(name)
        return self[name]
