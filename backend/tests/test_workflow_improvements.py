from datetime import datetime, timezone
from unittest.mock import patch

from app.models.resume_model import serialize_resume
from app.models.score_model import serialize_score
from app.services.question_service import QuestionService
from app.services.report_service import ReportService
from app.services.readiness_service import build_assessment_summary, classify_readiness
from app.services.speech_service import SpeechService
from app.services.evaluation_service import EvaluationService
from app.services.feedback_service import FeedbackService
from app.ai.llm_client import LLMClientError
from app.api.routes.export import _report_pdf


class UnavailableLLM:
    async def generate(self, _prompt):
        raise LLMClientError("unavailable")


class MalformedFeedbackLLM:
    async def generate(self, _prompt):
        return '{"overall_score": 99, "strengths": "invented malformed value"}'

    @staticmethod
    def parse_json(response):
        import json
        return json.loads(response)


class UnexpectedFeedbackLLM:
    async def generate(self, _prompt):
        raise AssertionError("No-answer reports should not make a model request")


def run_immediate(coroutine):
    """Run async services backed by immediate fake providers without opening sockets."""
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    raise AssertionError("The test provider unexpectedly performed asynchronous I/O")


def test_speech_analysis_recomputes_metrics_and_ignores_client_pause_count():
    service = SpeechService()
    analysis = service.build_speech_analysis(
        "Um, this is basically a useful answer.",
        {"duration_seconds": 10, "pause_count": 99, "result_timestamps": [1, 5, 9]},
    )
    assert analysis["word_count"] == 7
    assert analysis["filler_count"] == 2
    assert analysis["pause_count"] == 2
    assert analysis["longest_pause_seconds"] == 4


def test_question_difficulty_thresholds_and_fallback_adaptation():
    assert [QuestionService.difficulty_for_score(score) for score in (20, 65, 90)] == [
        "easy", "medium", "hard"
    ]
    service = QuestionService(UnavailableLLM())
    text, _, _ = service._adaptive_fallback(
        {"question_id": 2, "question": "Explain caching", "topic_focus": "caching", "expected_points": ["TTL"]},
        "hard",
    )
    assert "trade-offs" in text


def test_follow_up_fallback_is_specific_and_bounded():
    service = QuestionService(UnavailableLLM())
    text, _, _ = service._follow_up_fallback(
        {"question_id": 3, "topic_focus": "database indexes", "question": "How do indexes work?"},
        {"score": 30, "missing_points": ["write overhead"]},
        "easy",
    )
    assert "write overhead" in text


def test_report_does_not_claim_unmeasured_webcam_analysis_or_hiring_prediction():
    report = ReportService().generate_report({}, [], {"overall_score": 70})
    assert "No webcam metrics were recorded" in report["Body Language"]
    assert "not a prediction of hiring outcomes" in report["Executive Summary"]


def test_resume_serializer_never_exposes_raw_text():
    resume = serialize_resume(
        {
            "_id": "resume-id",
            "user_id": "user-id",
            "filename": "resume.pdf",
            "raw_text": "private extracted resume text",
            "uploaded_at": datetime.now(timezone.utc),
        }
    )
    assert "raw_text" not in resume


def test_report_pdf_produces_pdf_bytes():
    import pymupdf

    pdf = _report_pdf(
        {
            "interview": {"id": "i1", "created_at": "2026-10-25", "questions": []},
            "score": {
                "overall_score": 5.1, "performance_score": 5.1,
                "readiness_category": "Needs substantial practice", "answered_questions": 2,
                "total_questions": 12, "completion_percentage": 16.7,
                "assessment_reliability": "Limited sample", "assessment_note": "Small sample warning.",
                "report": {"Executive Summary": "Practice feedback."},
            },
            "answers": [],
        }
    )
    assert pdf.startswith(b"%PDF-")
    document = pymupdf.open(stream=pdf, filetype="pdf")
    text = " ".join(page.get_text() for page in document)
    assert "Needs substantial practice" in text
    assert "2 of 12 answered (16.7%)" in text
    document.close()


def test_partial_interview_can_be_scored_with_unanswered_questions():
    question_scores, overall, communication = EvaluationService().score_from_questions_and_answers(
        [
            {"question_id": 1, "skill": "Python", "question": "Explain Python", "expected_points": []},
            {"question_id": 2, "skill": "APIs", "question": "Explain APIs", "expected_points": []},
        ],
        [{"question_id": 1, "answer_text": "A response", "evaluation": {"score": 72, "communication_score": 80}}],
    )
    assert len(question_scores) == 2
    assert question_scores[1]["answer_text"] == ""
    assert question_scores[1]["score"] == 0
    assert question_scores[0]["answer_status"] == "answered"
    assert question_scores[1]["answer_status"] == "unanswered"
    assert classify_readiness(5.1) == "Needs substantial practice"
    assert overall == 36
    assert communication == 80


def test_readiness_thresholds_and_low_score_regression():
    assert [classify_readiness(score) for score in (0, 19.9, 20, 39.9, 40, 59.9, 60, 79.9, 80, 100)] == [
        "Needs substantial practice", "Needs substantial practice", "Developing", "Developing",
        "Moderate readiness; significant improvement needed", "Moderate readiness; significant improvement needed", "Good progress", "Good progress",
        "Strong interview readiness", "Strong interview readiness",
    ]
    assert build_assessment_summary(5.1, [{"answer_status": "answered"}] * 2 + [{"answer_status": "unanswered"}] * 10)["readiness_category"] == "Needs substantial practice"
    assert build_assessment_summary(0, [{"answer_status": "evaluation_failed"}] * 2)["readiness_category"] == "Assessment unavailable"
    assert build_assessment_summary(0, [{"answer_status": "unanswered"}] * 2)["readiness_category"] == "Needs substantial practice"


def test_serialized_score_and_persisted_report_use_same_readiness():
    score = serialize_score({
        "_id": "s1", "user_id": "u1", "interview_id": "i1", "overall_score": 5.1,
        "question_scores": [{"answer_status": "answered", "answer_text": "short"}] * 2
        + [{"answer_status": "unanswered", "answer_text": ""}] * 10,
    })
    report = ReportService().generate_report({"questions": [{}] * 12}, [], score)
    assert score["readiness_category"] == "Needs substantial practice"
    assert score["completion_percentage"] == 16.7
    assert score["readiness_category"] in report["Performance"]


def test_zero_answers_and_failed_evaluation_are_distinct():
    rows, overall, communication = EvaluationService().score_from_questions_and_answers(
        [{"question_id": 1}, {"question_id": 2}, {"question_id": 2}],
        [{"question_id": 1, "answer_text": "A response with enough words", "evaluation": {"score": 80}},
         {"question_id": 2, "answer_text": "An answer without evaluation"}],
    )
    assert len(rows) == 2
    assert rows[1]["answer_status"] == "evaluation_failed"
    assert overall == 80
    assert 0 <= communication <= 100
    empty, score, _ = EvaluationService().score_from_questions_and_answers([], [])
    assert empty == [] and score == 0
    skipped, skipped_score, _ = EvaluationService().score_from_questions_and_answers(
        [{"question_id": 1}],
        [{"question_id": 1, "answer_text": "", "answer_status": "skipped", "evaluation": {"score": 0}}],
    )
    assert skipped[0]["answer_status"] == "skipped"
    assert skipped_score == 0


def test_behavioral_rubric_does_not_score_technical_depth():
    with patch("app.services.evaluation_service.cosine_similarity_score", return_value=0.5):
        result = EvaluationService().evaluate_question(
            {"question_id": 1, "question_type": "behavioral", "question": "Describe a difficult project",
             "expected_answer": "I planned and delivered a project outcome", "expected_points": ["action", "result"]},
            "In the situation I needed to deliver. I implemented a solution and the result improved performance.",
        )
    assert result["technical_depth_score"] is None
    assert 0 <= result["score"] <= 100


def test_partial_report_calls_out_unanswered_questions():
    report = ReportService().generate_report(
        {"questions": [{"question_id": 1}, {"question_id": 2}]},
        [{"question_id": 1, "answer_text": "A response"}],
        {"overall_score": 40},
    )
    assert "1 question(s) were unanswered" in report["Executive Summary"]
    assert "1 of 2" in report["Technical"]


def test_feedback_validates_model_output_and_keeps_computed_score():
    service = FeedbackService(MalformedFeedbackLLM())
    feedback = run_immediate(service.generate_feedback(
        [{"question_id": 1, "skill": "Python", "expected_points": ["types"]}],
        [{"question_id": 1, "answer_text": "I explained types", "score": 70}],
    ))
    assert feedback["overall_score"] == 70
    assert "invented malformed value" not in feedback["strengths"]


def test_empty_interview_feedback_does_not_claim_answers_or_call_llm():
    service = FeedbackService(UnexpectedFeedbackLLM())
    feedback = run_immediate(service.generate_feedback(
        [{"question_id": 1, "skill": "Python"}],
        [],
    ))
    assert feedback["overall_score"] == 0
    assert feedback["strengths"] == []
    assert any("No answer was recorded" in item for item in feedback["weaknesses"])
