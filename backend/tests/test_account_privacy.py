import json
from types import SimpleNamespace

from bson import ObjectId

from app.api.routes import account


class Cursor:
    def __init__(self, rows): self.rows = rows
    async def to_list(self, length=None): return self.rows


class Collection:
    def __init__(self, rows=None): self.rows = rows or []; self.queries = []; self.deleted = []
    async def find_one(self, query, projection=None): self.queries.append(query); return next((dict(x) for x in self.rows if all(x.get(k) == v for k, v in query.items())), None)
    def find(self, query, projection=None): self.queries.append(query); return Cursor([x for x in self.rows if all(x.get(k) == v for k, v in query.items())])
    async def delete_many(self, query): self.deleted.append(query); return SimpleNamespace(deleted_count=0)
    async def delete_one(self, query): self.deleted.append(query); return SimpleNamespace(deleted_count=1)


class Database:
    def __init__(self, uid):
        self.users = Collection([{"_id": ObjectId(uid), "name": "User", "email": "user@example.com", "password_hash": "must-not-export"}])
        self.interviews = Collection([{"_id": ObjectId(), "user_id": uid}])
        self.answers = Collection([{"user_id": uid, "answer_text": "my answer"}, {"user_id": "another-user", "answer_text": "private"}])
        self.scores = Collection(); self.resumes = Collection(); self.resume_optimizations = Collection()
    def __getitem__(self, collection): return getattr(self, collection)


def run_immediate(coroutine):
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    raise AssertionError("The mocked database unexpectedly performed asynchronous I/O")


def test_export_includes_only_owned_records_and_excludes_password_hash(monkeypatch):
    uid = str(ObjectId()); database = Database(uid)
    monkeypatch.setattr(account, "get_database", lambda: database)
    response = run_immediate(account.export_account_data({"id": uid}))
    payload = json.loads(response.body)
    assert "password_hash" not in payload["account"]
    assert payload["collections"]["answers"] == [{"user_id": uid, "answer_text": "my answer"}]
    assert all(collection.queries and collection.queries[-1] == {"user_id": uid} for collection in [database.answers, database.scores, database.resumes, database.interviews, database.resume_optimizations])


def test_account_deletion_scopes_owned_records_and_deletes_identity_last(monkeypatch):
    uid = str(ObjectId()); database = Database(uid)
    monkeypatch.setattr(account, "get_database", lambda: database)
    response = run_immediate(account.delete_account({"id": uid}))
    assert response.status_code == 204
    assert database.users.deleted[-1] == {"_id": ObjectId(uid)}
    assert database.resumes.deleted == [{"user_id": uid}]
    assert all(query == {"user_id": uid} or "interview_id" in query for query in database.answers.deleted)
