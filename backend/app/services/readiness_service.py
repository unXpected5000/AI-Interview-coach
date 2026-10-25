"""Canonical, coaching-only interview readiness classification."""
from __future__ import annotations

import math
from typing import Any

from app.core.config import settings



def classify_readiness(score: Any) -> str:
    try:
        value = float(score)
    except (TypeError, ValueError):
        value = 0.0
    if not math.isfinite(value):
        value = 0.0
    value = max(0.0, min(100.0, value))
    if value < settings.readiness_developing_threshold:
        return "Needs substantial practice"
    if value < settings.readiness_moderate_threshold:
        return "Developing"
    if value < settings.readiness_good_progress_threshold:
        return "Moderate readiness; significant improvement needed"
    if value < settings.readiness_strong_threshold:
        return "Good progress"
    return "Strong interview readiness"


def build_assessment_summary(score: Any, question_scores: list[dict] | None) -> dict[str, Any]:
    try:
        numeric_score = float(score or 0)
    except (TypeError, ValueError):
        numeric_score = 0.0
    if not math.isfinite(numeric_score):
        numeric_score = 0.0
    rows = question_scores or []
    statuses = [str(row.get("answer_status", "answered")) for row in rows if isinstance(row, dict)]
    total = len(statuses)
    evaluated = sum(status in {"answered", "partial", "interrupted"} for status in statuses)
    skipped = statuses.count("skipped")
    failed = statuses.count("evaluation_failed")
    answered = evaluated + failed
    has_scored_or_zero_rubric_item = any(status in {"answered", "partial", "interrupted", "unanswered", "skipped"} for status in statuses)
    completion = round(answered / total * 100, 1) if total else 0.0
    limited = evaluated < 5 or completion < 50
    reliability = "Unavailable" if not has_scored_or_zero_rubric_item else "Limited sample" if limited else "Moderate sample"
    note = (
        "No performance score could be calculated because all submitted answers failed evaluation. The readiness category is unavailable."
        if not has_scored_or_zero_rubric_item and failed else
        "No interview questions were available to score; readiness is unavailable."
        if not has_scored_or_zero_rubric_item else
        f"Assessment uses {evaluated} evaluated answer(s) from {total} questions ({answered} attempted) and is not a reliable measure of complete interview readiness."
        if limited else "Assessment reflects the answered questions in this practice interview; it is not a prediction of hiring outcomes."
    )
    if failed:
        note += f" Evaluation was unavailable for {failed} question(s); those questions were excluded from the performance denominator."
    return {
        "performance_score": round(max(0.0, min(100.0, numeric_score)), 2),
        "readiness_category": classify_readiness(score) if has_scored_or_zero_rubric_item else "Assessment unavailable",
        "answered_questions": answered,
        "evaluated_questions": evaluated,
        "total_questions": total,
        "completion_percentage": completion,
        "skipped_questions": skipped,
        "evaluation_failed_questions": failed,
        "assessment_reliability": reliability,
        "assessment_note": note,
        "scoring_rubric": "Overall score is the mean of valid evaluated answers plus zero-point unanswered or skipped questions; evaluation failures are excluded. Technical answers use semantic similarity (20%), completeness (15%), relevance (10%), communication (10%), key-point coverage (10%), answer structure (15%), and technical depth (15%); these weights are normalized to 100. Behavioral/situational answers replace technical depth with additional STAR structure weight (30% structure total).",
    }
