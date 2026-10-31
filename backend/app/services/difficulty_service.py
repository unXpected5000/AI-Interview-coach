"""Deterministic, coaching-only adaptive difficulty decisions."""
from __future__ import annotations

from typing import Any
from datetime import datetime

LEVELS = ("low", "medium", "hard")


def next_difficulty(current: str, mode: str, evaluated_scores: list[float]) -> tuple[str, str | None]:
    """Adjust by one level only after a small rolling window of valid evaluations."""
    if mode != "adaptive" or current not in LEVELS:
        return current, None
    window = evaluated_scores[-3:]
    if len(window) < 3:
        return current, None
    average = sum(window) / len(window)
    index = LEVELS.index(current)
    if average >= 80 and index < len(LEVELS) - 1:
        return LEVELS[index + 1], f"The last three evaluated answers averaged {average:.1f}/100. Difficulty increased one level."
    if average < 55 and index > 0:
        return LEVELS[index - 1], f"The last three evaluated answers averaged {average:.1f}/100. Difficulty decreased one level for focused practice."
    return current, None


def valid_evaluation_scores(answers: list[dict[str, Any]]) -> list[float]:
    scores: list[float] = []
    ordered = list(enumerate(answers))
    def chronology(row: tuple[int, dict[str, Any]]) -> tuple[bool, float]:
        index, answer = row
        value = answer.get("updated_at") or answer.get("answered_at")
        if isinstance(value, datetime):
            return True, value.timestamp()
        return False, float(index)
    ordered.sort(key=chronology)
    for _, answer in ordered:
        if answer.get("answer_status") not in {"answered", "partial", "interrupted"}:
            continue
        value = (answer.get("evaluation") or {}).get("score")
        try:
            score = float(value)
        except (TypeError, ValueError):
            continue
        if 0 <= score <= 100:
            scores.append(score)
    return scores
