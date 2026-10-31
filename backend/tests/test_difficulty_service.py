from app.services.difficulty_service import next_difficulty, valid_evaluation_scores
from app.services.report_service import ReportService
from app.services.readiness_service import build_assessment_summary
from datetime import datetime, timezone, timedelta


def test_fixed_difficulty_never_changes():
    assert next_difficulty("medium", "fixed", [95, 92, 90]) == ("medium", None)


def test_adaptive_difficulty_moves_one_step_after_three_strong_answers():
    level, reason = next_difficulty("low", "adaptive", [82, 91, 80])
    assert level == "medium"
    assert "three evaluated answers" in reason


def test_adaptive_difficulty_moves_one_step_after_three_low_answers():
    level, reason = next_difficulty("hard", "adaptive", [40, 45, 51])
    assert level == "medium"
    assert "decreased one level" in reason


def test_adaptive_difficulty_requires_three_scores_and_ignores_failed_skipped():
    assert next_difficulty("medium", "adaptive", [99, 99]) == ("medium", None)
    answers = [
        {"answer_status": "answered", "evaluation": {"score": 80}},
        {"answer_status": "skipped", "evaluation": {"score": 0}},
        {"answer_status": "evaluation_failed", "evaluation": {"score": 100}},
        {"answer_status": "partial", "evaluation": {"score": 70}},
    ]
    assert valid_evaluation_scores(answers) == [80.0, 70.0]


def test_difficulty_report_includes_progression_and_unattempted_levels():
    report = ReportService().generate_report(
        {"difficulty": {"initial": "low", "current": "medium", "mode": "adaptive", "history": [{"from": "low", "to": "medium", "reason": "consistent answers"}]}, "questions": []},
        [],
        {"overall_score": 80, "question_scores": [{"difficulty": "low", "answer_status": "answered", "score": 80}, {"difficulty": "hard", "answer_status": "unanswered"}]},
    )
    section = report["Interview Difficulty Analysis"]
    assert section["initial_difficulty"] == "low"
    assert section["progression"][0]["to"] == "medium"
    assert section["by_difficulty"]["hard"]["unanswered"] == 1


def test_high_score_at_low_difficulty_does_not_claim_strong_interview_readiness():
    result = build_assessment_summary(99, [{"answer_status": "answered", "score": 99, "difficulty": "low"}])
    assert result["readiness_category"] == "Good progress"
    assert "not evidence of readiness" in result["assessment_note"]


def test_rolling_window_follows_answer_update_time_not_question_order():
    now = datetime.now(timezone.utc)
    rows = [
        {"answer_status": "answered", "evaluation": {"score": 10}, "updated_at": now - timedelta(minutes=3)},
        {"answer_status": "answered", "evaluation": {"score": 90}, "updated_at": now - timedelta(minutes=1)},
        {"answer_status": "answered", "evaluation": {"score": 90}, "updated_at": now - timedelta(minutes=2)},
        {"answer_status": "answered", "evaluation": {"score": 95}, "updated_at": now},
    ]
    assert valid_evaluation_scores(rows)[-3:] == [90.0, 90.0, 95.0]
