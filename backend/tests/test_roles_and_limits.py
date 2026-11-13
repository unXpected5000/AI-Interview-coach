"""Role enforcement through the HTTP routes, and bounded rate limiting."""
import asyncio
from datetime import datetime, timezone

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.api import deps
from app.core import rate_limit
from app.core.rate_limit import RateRule, SlidingWindowLimiter
from app.main import app
from app.models.user_model import serialize_user
from app.repositories.interview_repository import InterviewRepository
from app.repositories.score_repository import ScoreRepository
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from app.services.user_management_service import UserManagementService
from tests.fake_mongo import FakeDatabase

NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)


def add_user(database, name, role="student", department="Computer Science", year=2, verified=True):
    document = {
        "_id": ObjectId(), "name": name, "email": f"{name.lower().replace(' ', '.')}@example.com",
        "password_hash": "hash", "google_id": None, "email_verified": verified, "role": role,
        "department": department, "year": year if role == "student" else None, "phone": None,
        "created_at": NOW, "updated_at": NOW,
    }
    asyncio.run(database["users"].insert_one(document))
    return serialize_user(document)


@pytest.fixture()
def world():
    database = FakeDatabase()
    cs_hod = add_user(database, "Cs Hod", role="department_faculty")
    me_hod = add_user(database, "Me Hod", role="department_faculty", department="Mechanical")
    operator = add_user(database, "Op Erator", role="operator", department=None)
    cs_student = add_user(database, "Cs Student")
    me_student = add_user(database, "Me Student", department="Mechanical")
    pending = add_user(database, "Pending Person", verified=False)
    interview_id = ObjectId()
    asyncio.run(database["interviews"].insert_one({
        "_id": interview_id, "user_id": cs_student["id"], "resume_id": "r1", "status": "completed",
        "created_at": NOW, "completed_at": NOW, "questions": [{"question_id": 1, "question": "Q", "expected_answer": "secret"}],
        "difficulty": {"initial": "medium", "current": "medium", "mode": "adaptive"},
    }))
    asyncio.run(database["scores"].insert_one({
        "interview_id": str(interview_id), "user_id": cs_student["id"], "overall_score": 72.0, "created_at": NOW,
        "question_scores": [{"answer_status": "answered", "score": 72, "difficulty": "medium", "answer_text": "PRIVATE ANSWER", "transcript": "PRIVATE"}],
    }))
    current = {"user": None}
    app.dependency_overrides[deps.get_current_user] = lambda: current["user"]
    app.dependency_overrides[deps.get_user_management_service] = lambda: UserManagementService(
        UserRepository(database), InterviewRepository(database), ScoreRepository(database)
    )
    client = TestClient(app)
    yield {"client": client, "as": lambda user: current.__setitem__("user", user), "db": database,
           "cs_hod": cs_hod, "me_hod": me_hod, "operator": operator, "cs_student": cs_student,
           "me_student": me_student, "pending": pending}
    app.dependency_overrides.clear()


def test_students_cannot_reach_staff_endpoints(world):
    client = world["client"]
    world["as"](world["cs_student"])
    assert client.get("/api/department/students").status_code == 403
    assert client.get("/api/admin/users").status_code == 403
    assert client.put(f"/api/admin/users/{world['cs_student']['id']}/role", json={"role": "operator"}).status_code == 403


def test_hod_sees_only_own_department_without_answers_or_transcripts(world):
    client = world["client"]
    world["as"](world["cs_hod"])
    response = client.get("/api/department/students")
    assert response.status_code == 200
    names = [user["name"] for user in response.json()["users"]]
    assert names == ["Cs Student", "Pending Person"]
    progress = client.get(f"/api/department/students/{world['cs_student']['id']}")
    assert progress.status_code == 200
    body = progress.text
    for forbidden in ("PRIVATE", "secret", "password_hash", "answer_text", "transcript", "resume_id"):
        assert forbidden not in body
    assert progress.json()["interviews"][0]["performance_score"] == 72.0
    assert client.get(f"/api/department/students/{world['me_student']['id']}").status_code == 404
    assert client.get(f"/api/department/students/{world['cs_hod']['id']}").status_code == 404


def test_hod_edits_are_limited_to_profile_fields_and_own_department(world):
    client = world["client"]
    world["as"](world["cs_hod"])
    student_id = world["cs_student"]["id"]
    ok = client.patch(f"/api/department/students/{student_id}", json={"name": "Renamed Student", "year": 3, "phone": "+1 555 0100", "role": "operator"})
    assert ok.status_code == 200
    assert ok.json()["year"] == 3 and ok.json()["role"] == "student"
    moved = client.patch(f"/api/department/students/{student_id}", json={"department": "Mechanical"})
    assert moved.status_code == 403
    other = client.patch(f"/api/department/students/{world['me_student']['id']}", json={"name": "Hijacked"})
    assert other.status_code == 404
    assert client.put(f"/api/admin/users/{student_id}/role", json={"role": "department_faculty"}).status_code == 403


def test_users_cannot_escalate_or_move_themselves(world):
    client = world["client"]
    world["as"](world["cs_student"])
    response = client.patch("/api/users/me", json={"name": "New Name", "role": "operator"})
    assert response.status_code == 200 and response.json()["role"] == "student"
    assert client.patch("/api/users/me", json={"department": "Mechanical"}).status_code == 403
    assert client.patch("/api/users/me", json={"year": 4}).status_code == 403


def test_profile_completion_sets_missing_department_and_year_once(world):
    client = world["client"]
    incomplete = add_user(world["db"], "New Google User", department=None, year=None)
    assert incomplete["profile_complete"] is False
    world["as"](incomplete)
    response = client.patch("/api/users/me", json={"department": "civil", "year": 1})
    assert response.status_code == 200
    assert response.json()["department"] == "Civil" and response.json()["profile_complete"] is True


def test_operator_manages_roles_and_cross_department_moves(world):
    client = world["client"]
    world["as"](world["operator"])
    student_id = world["cs_student"]["id"]
    assert client.patch(f"/api/admin/users/{student_id}", json={"department": "Mechanical"}).json()["department"] == "Mechanical"
    promoted = client.put(f"/api/admin/users/{world['me_student']['id']}/role", json={"role": "department_faculty", "department": "Civil"})
    assert promoted.status_code == 200 and promoted.json()["role"] == "department_faculty" and promoted.json()["department"] == "Civil"
    assert promoted.json()["year"] is None
    assert client.put(f"/api/admin/users/{world['operator']['id']}/role", json={"role": "student"}).status_code == 403
    assert client.put(f"/api/admin/users/{world['pending']['id']}/role", json={"role": "operator"}).status_code == 403
    assert client.put(f"/api/admin/users/{student_id}/role", json={"role": "superuser"}).status_code == 422
    listing = client.get("/api/admin/users", params={"role": "department_faculty"})
    assert {user["name"] for user in listing.json()["users"]} == {"Cs Hod", "Me Hod", "Me Student"}


def test_incomplete_profiles_cannot_start_interviews(world):
    client = world["client"]
    world["as"](add_user(world["db"], "No Year", department="Civil", year=None))
    response = client.post("/api/interviews/start", json={"resume_id": str(ObjectId())})
    assert response.status_code == 403


def test_sliding_window_limiter_blocks_expires_and_stays_bounded():
    clock = {"now": 0.0}
    limiter = SlidingWindowLimiter(max_keys=3, clock=lambda: clock["now"])
    assert [limiter.hit("a", 2, 10) for _ in range(3)][-1] is not None
    clock["now"] = 10.5
    assert limiter.hit("a", 2, 10) is None
    for key in "bcdef":
        limiter.hit(key, 2, 10)
    assert len(limiter) == 3


def test_login_route_returns_429_with_retry_after(monkeypatch):
    rate_limit.limiter.reset()
    monkeypatch.setattr(rate_limit, "LOGIN_EMAIL", RateRule("login-email-test", 2, 60))

    class RejectingAuth(AuthService):
        def __init__(self):
            pass

        async def login(self, email, password):
            from app.services.auth_service import AuthError
            raise AuthError()

    app.dependency_overrides[deps.get_auth_service] = lambda: RejectingAuth()
    try:
        client = TestClient(app)
        body = {"email": "someone@example.com", "password": "guess"}
        assert [client.post("/api/auth/login", json=body).status_code for _ in range(2)] == [401, 401]
        blocked = client.post("/api/auth/login", json=body)
        assert blocked.status_code == 429
        assert int(blocked.headers["Retry-After"]) >= 1
    finally:
        app.dependency_overrides.clear()
        rate_limit.limiter.reset()


def test_removed_roles_endpoint_is_not_routed():
    paths = {getattr(route, "path", "") for route in app.routes}
    assert not any(path.endswith("/roles") for path in paths)


def test_database_unavailable_returns_503(monkeypatch):
    from app.db import mongodb

    monkeypatch.setattr(mongodb, "mongo_client", None)
    app.dependency_overrides[deps.get_current_user] = lambda: {"id": "x", "profile_complete": True}
    try:
        response = TestClient(app).get("/api/resumes")
        assert response.status_code == 503
    finally:
        app.dependency_overrides.clear()
