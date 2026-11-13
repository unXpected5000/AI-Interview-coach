"""HTTP-level walk through the main workflows against an in-memory database.

Exercises the real routers, dependencies, services, and repositories. Only
MongoDB (in-memory fake), email delivery (captured), and the LLM (unavailable,
so deterministic fallbacks run) are replaced.
"""
import io
import re

import pymupdf as fitz
import pytest
from fastapi.testclient import TestClient

from app.ai.llm_client import LLMClientError
from app.api import deps
from app.core import rate_limit
from app.core.config import settings
from app.db import mongodb
from app.main import app
from app.services import auth_service as auth_module
from tests.fake_mongo import FakeDatabase


class FakeClient:
    def __init__(self):
        self.database = FakeDatabase()

    def __getitem__(self, _name):
        return self.database


class OfflineLLM:
    async def generate(self, _prompt):
        raise LLMClientError("offline in tests")

    @staticmethod
    def parse_json(text):
        raise LLMClientError("offline in tests")

    async def close(self):
        return None


class CapturingEmail:
    def __init__(self):
        self.codes: dict[str, str] = {}

    def ensure_available(self):
        return None

    async def send_verification_code(self, recipient, code, minutes):
        self.codes[recipient] = code


@pytest.fixture()
def api(monkeypatch):
    client_stub = FakeClient()
    email = CapturingEmail()
    monkeypatch.setattr(mongodb, "mongo_client", client_stub)
    monkeypatch.setattr(settings, "jwt_secret_key", "end-to-end-test-secret")
    monkeypatch.setattr(settings, "operator_emails", "ops@example.com")
    original_init = auth_module.AuthService.__init__

    def init_with_capture(self, repository, email_service=None, clock=None):
        original_init(self, repository, email_service=email, **({"clock": clock} if clock else {}))

    monkeypatch.setattr(auth_module.AuthService, "__init__", init_with_capture)
    app.dependency_overrides[deps.get_llm_client] = lambda: OfflineLLM()
    rate_limit.limiter.reset()
    yield TestClient(app), email, client_stub.database
    app.dependency_overrides.clear()
    rate_limit.limiter.reset()


def make_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "Jane Doe\nSkills: Python, SQL, FastAPI, React, Docker\nProjects: Built a REST API with FastAPI and PostgreSQL")
    data = document.tobytes()
    document.close()
    return data


def signup(client, email_capture, email, department="Computer Science", year=2):
    password = "a long password 123"
    response = client.post("/api/auth/register", json={"name": email.split("@")[0].title(), "email": email, "password": password, "department": department, "year": year})
    assert response.status_code == 202, response.text
    assert "access_token" not in response.json()
    blocked = client.post("/api/auth/login", json={"email": email, "password": password})
    assert blocked.status_code == 403 and blocked.json()["detail"]["code"] == "email_verification_required"
    verified = client.post("/api/auth/verify-email", json={"email": email, "code": email_capture.codes[email], "password": password})
    assert verified.status_code == 200, verified.text
    return {"Authorization": f"Bearer {verified.json()['access_token']}"}, verified.json()["user"]


def test_full_student_staff_and_operator_workflow(api):
    client, email_capture, database = api

    # Student: register, verify, upload, interview.
    student_headers, student = signup(client, email_capture, "student@example.com")
    assert student["role"] == "student" and student["profile_complete"] is True
    upload = client.post("/api/resumes/upload", headers=student_headers, files={"file": ("resume.pdf", make_pdf(), "application/pdf")})
    assert upload.status_code == 201, upload.text
    resume_id = upload.json()["id"]

    started = client.post("/api/interviews/start", headers=student_headers, json={"resume_id": resume_id, "difficulty": "medium", "difficulty_mode": "adaptive"})
    assert started.status_code == 201, started.text
    interview = started.json()["interview"]
    assert all(q["expected_answer"] is None and q["expected_points"] == [] for q in interview["questions"])
    harder = client.post("/api/interviews/start", headers=student_headers, json={"resume_id": resume_id, "difficulty": "hard", "difficulty_mode": "adaptive"})
    assert harder.json()["interview"]["id"] != interview["id"]

    first, second = interview["questions"][0], interview["questions"][1]
    answer = client.post(f"/api/interviews/{interview['id']}/answer", headers=student_headers, json={
        "question_id": first["question_id"],
        "answer_text": "I built a FastAPI service with SQL indexes, tests, and Docker deployment, and measured latency.",
        "webcam_metrics": {"consent": True, "sample_count": 25, "face_visibility_pct": 96, "gaze_samples": 20, "gaze_toward_camera_pct": 70,
                            "timeline": [{"t": 0, "face": 100, "gaze": 70}, {"t": 5, "face": 90, "gaze": None}]},
    })
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["matched_points"] == [] and "expected_points" not in body["evaluation"]
    if body.get("follow_up_question"):
        assert body["follow_up_question"]["expected_answer"] is None

    # The account export must not reveal the answer key while the interview is active.
    active_export = client.get("/api/account/export", headers=student_headers)
    assert active_export.status_code == 200
    assert "expected_answer" not in active_export.text and "expected_points" not in active_export.text

    skipped = client.post(f"/api/interviews/{interview['id']}/answer", headers=student_headers, json={"question_id": second["question_id"], "answer_text": "", "answer_status": "skipped"})
    assert skipped.status_code == 200 and skipped.json()["answer_status"] == "skipped"
    invalid = client.post(f"/api/interviews/{interview['id']}/answer", headers=student_headers, json={"question_id": "not-a-number"})
    assert invalid.status_code == 422 and isinstance(invalid.json()["detail"], list)

    completed = client.post(f"/api/interviews/{interview['id']}/complete", headers=student_headers)
    assert completed.status_code == 200, completed.text
    state = client.get(f"/api/interviews/{interview['id']}", headers=student_headers).json()
    assert state["interview"]["questions"][0]["expected_answer"]  # revealed after completion
    assert state["score"]["webcam_summary"]["average_gaze_toward_camera_pct"] == 70.0
    pdf = client.get(f"/api/interviews/{interview['id']}/export/pdf", headers=student_headers)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    export = client.get("/api/account/export", headers=student_headers)
    assert export.status_code == 200 and "password_hash" not in export.text and "code_hash" not in export.text
    assert "expected_answer" in export.text  # completed interviews export in full

    # Operator bootstrap via OPERATOR_EMAILS, then promote an HOD.
    operator_headers, operator = signup(client, email_capture, "ops@example.com")
    assert operator["role"] == "operator"
    hod_headers, hod = signup(client, email_capture, "hod@example.com")
    assert client.get("/api/department/students", headers=hod_headers).status_code == 403
    promoted = client.put(f"/api/admin/users/{hod['id']}/role", headers=operator_headers, json={"role": "department_faculty", "department": "Computer Science"})
    assert promoted.status_code == 200, promoted.text

    # HOD: sees own department summary only, no answers/transcripts/resume text.
    listing = client.get("/api/department/students", headers=hod_headers)
    assert listing.status_code == 200
    names = {user["email"] for user in listing.json()["users"]}
    assert "student@example.com" in names and "ops@example.com" not in names
    detail = client.get(f"/api/department/students/{student['id']}", headers=hod_headers)
    assert detail.status_code == 200
    assert "FastAPI service" not in detail.text and "Jane Doe" not in detail.text
    assert detail.json()["interviews"][0]["status"] in {"completed", "active"}
    moved = client.patch(f"/api/department/students/{student['id']}", headers=hod_headers, json={"department": "Mechanical"})
    assert moved.status_code == 403
    edited = client.patch(f"/api/department/students/{student['id']}", headers=hod_headers, json={"year": 3, "phone": "+1 555 010 0200"})
    assert edited.status_code == 200 and edited.json()["year"] == 3

    # Operator moves the student across departments; the HOD then loses access.
    assert client.patch(f"/api/admin/users/{student['id']}", headers=operator_headers, json={"department": "Mechanical"}).status_code == 200
    assert client.get(f"/api/department/students/{student['id']}", headers=hod_headers).status_code == 404

    # Expired/invalid tokens produce a 401 the frontend turns into a sign-out.
    expired = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-valid-token"})
    assert expired.status_code == 401 and "Sign in again" in expired.json()["detail"]

    # No raw verification codes or secrets are stored.
    for user in database["users"].documents:
        assert all(code not in str(user) for code in email_capture.codes.values())


def test_registration_without_email_delivery_fails_clearly(monkeypatch):
    monkeypatch.setattr(mongodb, "mongo_client", FakeClient())
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "smtp_from_email", "")
    monkeypatch.setattr(settings, "email_dev_log_codes", False)
    rate_limit.limiter.reset()
    response = TestClient(app).post("/api/auth/register", json={"name": "Nobody", "email": "n@example.com", "password": "a long password 123", "department": "Civil", "year": 1})
    assert response.status_code == 503
    assert re.search(r"SMTP_HOST", response.json()["detail"])
