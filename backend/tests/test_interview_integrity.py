"""Interview reuse, answer-key non-disclosure, upload bounds, camera metrics, and Unicode PDFs."""
import asyncio
import io

import pymupdf as fitz
import pytest
from bson import ObjectId
from fastapi import HTTPException

from app.api.routes.export import _report_pdf
from app.api.routes.resumes import reject_oversized_upload
from app.core.config import settings
from app.repositories.answer_repository import AnswerRepository
from app.repositories.interview_repository import InterviewRepository
from app.repositories.resume_repository import ResumeRepository
from app.repositories.score_repository import ScoreRepository
from app.services.camera_metrics import normalize_webcam_metrics, summarize_webcam
from app.services.evaluation_service import EvaluationService
from app.services.interview_service import InterviewService
from app.services.report_service import ReportService
from app.services.resume_service import ResumeService
from app.services.speech_service import SpeechService
from tests.fake_mongo import FakeDatabase

USER = "user-1"
SECRET_ANSWER = "Use an index on the lookup column to avoid full scans."
SECRET_POINT = "composite index ordering"


def question(question_id, **extra):
    return {
        "question_id": question_id, "skill": "SQL", "difficulty": "medium", "question_type": "conceptual",
        "topic_focus": "indexes", "source_section": "skills", "question": f"Explain indexes ({question_id}).",
        "expected_answer": SECRET_ANSWER, "expected_points": [SECRET_POINT, "selectivity"], **extra,
    }


class StubQuestions:
    def __init__(self):
        self.generated = 0

    async def generate_questions(self, resume, context):
        self.generated += 1
        return [question(1), question(2)]

    async def generate_follow_up(self, parent, answer_text, score_payload, next_id, target_difficulty=None):
        return question(next_id, follow_up_for=parent["question_id"])

    async def adapt_question(self, next_question, answer_text, score, target_difficulty="medium"):
        return next_question


class StubFeedback:
    async def generate_feedback(self, questions, answers):
        return {"strengths": [], "weaknesses": [], "recommendations": [], "learning_roadmap": []}


def make_service():
    database = FakeDatabase()
    resume_id = ObjectId()
    asyncio.run(database["resumes"].insert_one({"_id": resume_id, "user_id": USER, "extracted_skills": ["SQL"]}))
    questions = StubQuestions()
    service = InterviewService(
        resume_repository=ResumeRepository(database),
        interview_repository=InterviewRepository(database),
        answer_repository=AnswerRepository(database),
        score_repository=ScoreRepository(database),
        question_service=questions,
        evaluation_service=EvaluationService(),
        feedback_service=StubFeedback(),
        speech_service=SpeechService(),
        report_service=ReportService(),
    )
    return service, database, str(resume_id), questions


def test_active_interview_is_reused_only_for_matching_difficulty_and_mode():
    service, database, resume_id, questions = make_service()
    first = asyncio.run(service.start_interview(USER, resume_id, "medium", "adaptive"))
    again = asyncio.run(service.start_interview(USER, resume_id, "medium", "adaptive"))
    harder = asyncio.run(service.start_interview(USER, resume_id, "hard", "adaptive"))
    fixed = asyncio.run(service.start_interview(USER, resume_id, "medium", "fixed"))
    assert again["id"] == first["id"]
    assert len({first["id"], harder["id"], fixed["id"]}) == 3
    assert questions.generated == 3
    assert len(database["interviews"].documents) == 3  # the earlier session is preserved


def test_invalid_difficulty_mode_is_rejected():
    service, _database, resume_id, _questions = make_service()
    with pytest.raises(HTTPException) as error:
        asyncio.run(service.start_interview(USER, resume_id, "medium", "chaotic"))
    assert error.value.status_code == 422


def test_answer_key_is_hidden_while_active_and_revealed_after_completion():
    service, _database, resume_id, _questions = make_service()
    interview = asyncio.run(service.start_interview(USER, resume_id))
    assert SECRET_ANSWER not in str(interview) and SECRET_POINT not in str(interview)

    # A very short answer scores low, which triggers a follow-up question.
    saved = asyncio.run(service.submit_answer(interview["id"], USER, 1, "indexes help"))
    assert saved["follow_up_question"] is not None
    assert SECRET_ANSWER not in str(saved) and SECRET_POINT not in str(saved)
    assert saved["matched_points"] == [] and saved["missing_points"] == []

    state = asyncio.run(service.get_interview(interview["id"], USER))
    assert SECRET_ANSWER not in str(state) and SECRET_POINT not in str(state)

    asyncio.run(service.complete_interview(interview["id"], USER))
    completed = asyncio.run(service.get_interview(interview["id"], USER))
    assert completed["interview"]["questions"][0]["expected_answer"] == SECRET_ANSWER
    assert SECRET_POINT in str(completed["answers"])


def test_skipped_question_is_recorded_without_an_answer():
    service, _database, resume_id, _questions = make_service()
    interview = asyncio.run(service.start_interview(USER, resume_id))
    saved = asyncio.run(service.submit_answer(interview["id"], USER, 1, "", answer_status="skipped"))
    assert saved["answer_status"] == "skipped" and saved["score"] == 0


def test_camera_metrics_require_consent_and_are_bounded():
    assert normalize_webcam_metrics({"sample_count": 10, "face_visibility_pct": 80}) == {}
    metrics = normalize_webcam_metrics({
        "consent": True, "sample_count": 40, "face_visibility_pct": 140, "gaze_toward_camera_pct": 55,
        "gaze_samples": 0, "posture_upright_pct": 70, "posture_samples": 12, "head_yaw_mean_deg": -200,
        "head_pose_samples": 30, "raw_frame": "data:image/png;base64,AAAA",
        "timeline": [{"t": index, "face": 100, "gaze": None, "extra": 1} for index in range(100)],
    })
    assert metrics["face_visibility_pct"] == 100.0
    assert "gaze_toward_camera_pct" not in metrics  # no supporting gaze samples
    assert metrics["posture_upright_pct"] == 70.0
    assert metrics["head_yaw_mean_deg"] == -90.0
    assert "raw_frame" not in metrics
    assert len(metrics["timeline"]) == 60 and metrics["timeline"][0]["gaze"] is None
    assert "extra" not in metrics["timeline"][0]


def test_camera_summary_reports_unavailable_signals_as_none():
    summary = summarize_webcam([{"webcam_metrics": {"face_visibility_pct": 90, "sample_count": 5}}, {"webcam_metrics": {}}])
    assert summary["average_face_visibility_pct"] == 90.0
    assert summary["average_gaze_toward_camera_pct"] is None
    assert summary["answers_with_metrics"] == 1
    assert "not measure confidence" in summary["measurement_note"]


class ChunkedUpload:
    def __init__(self, size: int, filename="resume.pdf"):
        self.remaining = size
        self.reads = 0
        self.filename = filename
        self.content_type = "application/pdf"

    async def read(self, size=-1):
        self.reads += 1
        if self.remaining <= 0:
            return b""
        chunk = min(size if size > 0 else self.remaining, self.remaining)
        self.remaining -= chunk
        return b"%PDF-" + b"0" * (chunk - 5) if self.reads == 1 else b"0" * chunk


def test_upload_reading_stops_once_the_limit_is_exceeded(monkeypatch):
    monkeypatch.setattr(settings, "max_resume_upload_mb", 1)
    service = ResumeService(*([None] * 7))
    upload = ChunkedUpload(50 * 1024 * 1024)
    with pytest.raises(HTTPException) as error:
        asyncio.run(service._read_bounded(upload))
    assert error.value.status_code == 413
    assert upload.reads <= 6  # stopped after ~1 MB, not after reading 50 MB


def test_declared_oversized_upload_is_rejected_before_parsing(monkeypatch):
    monkeypatch.setattr(settings, "max_resume_upload_mb", 1)

    class RequestStub:
        def __init__(self, length):
            self.headers = {"content-length": str(length)}

    reject_oversized_upload(RequestStub(1024 * 1024))
    with pytest.raises(HTTPException) as error:
        reject_oversized_upload(RequestStub(5 * 1024 * 1024))
    assert error.value.status_code == 413


def test_pdf_extraction_runs_off_the_event_loop(monkeypatch):
    calls = []

    async def fake_to_thread(function, *args):
        calls.append(function.__name__)
        return "Experienced SQL developer"

    import app.services.resume_service as resume_module

    monkeypatch.setattr(resume_module.asyncio, "to_thread", fake_to_thread)

    class Parser:
        def parse(self, text):
            return {}

    class Skills:
        def extract_skills(self, text, structured):
            return ["SQL"]

    class Repo:
        async def create(self, **kwargs):
            from datetime import datetime, timezone
            return {"_id": ObjectId(), "uploaded_at": datetime.now(timezone.utc), "structured_resume": {}, **kwargs}

    service = ResumeService(Repo(), Skills(), Parser(), None, None, None, None)
    result = asyncio.run(service.upload_resume(USER, ChunkedUpload(2048)))
    assert calls == ["_extract_text_from_pdf"]
    assert result["extracted_skills"] == ["SQL"]


def test_report_pdf_preserves_unicode_text():
    data = {
        "interview": {"id": "abc", "questions": [{"question_id": 1, "question": "Décrivez un index"}]},
        "answers": [{"question_id": 1, "answer_text": "Café résumé — 你好 Привет"}],
        "score": {"performance_score": 50, "report": {"Summary": "Naïve “quotes”"}},
    }
    document = fitz.open("pdf", io.BytesIO(_report_pdf(data)).getvalue())
    text = "".join(page.get_text() for page in document)
    for expected in ("Décrivez", "Café résumé", "你好", "Привет", "Naïve “quotes”"):
        assert expected in text
    assert "?" not in text.replace("Interview: abc", "")
