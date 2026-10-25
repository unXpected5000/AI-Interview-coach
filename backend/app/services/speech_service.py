from __future__ import annotations

import re
import math
from typing import Any


FILLER_PHRASES = [
    "you know",
    "sort of",
    "kind of",
    "actually",
    "basically",
    "um",
    "uh",
    "like",
    "i mean",
    "right",
    "well",
    "so to speak",
    "at the end of the day",
    "literally",
    "seriously",
    "honestly",
]


class SpeechService:
    def build_speech_analysis(
        self,
        transcript: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        cleaned_transcript = self._normalize_text(transcript)
        words = self._tokenize(cleaned_transcript)
        word_count = len(words)
        metadata = metadata or {}
        safe_duration = self._bounded_number(metadata.get("duration_seconds"), maximum=3600.0)
        words_per_minute = round((word_count / safe_duration) * 60, 2) if safe_duration > 0 else 0.0
        filler_breakdown, filler_count = self._count_fillers_with_breakdown(cleaned_transcript)
        filler_rate = round(filler_count / word_count, 4) if word_count > 0 else 0.0
        pause_gaps = self._pause_gaps(metadata.get("result_timestamps"), safe_duration)

        return {
            "word_count": word_count,
            "duration_seconds": round(safe_duration, 2),
            "words_per_minute": words_per_minute,
            "filler_count": filler_count,
            "filler_rate": filler_rate,
            "filler_breakdown": filler_breakdown,
            "pause_count": len(pause_gaps),
            "avg_pause_duration": round(sum(pause_gaps) / len(pause_gaps), 2) if pause_gaps else 0.0,
            "longest_pause_seconds": round(max(pause_gaps), 2) if pause_gaps else 0.0,
        }

    def communication_score(self, speech_analysis: dict[str, Any] | None, answer_text: str = "") -> float:
        if not speech_analysis:
            return self._length_based_score(answer_text)

        word_count = float(speech_analysis.get("word_count", 0) or 0)
        duration_seconds = float(speech_analysis.get("duration_seconds", 0) or 0)
        words_per_minute = float(speech_analysis.get("words_per_minute", 0) or 0)
        filler_count = float(speech_analysis.get("filler_count", 0) or 0)
        filler_rate = float(speech_analysis.get("filler_rate", 0) or 0)
        pauses = float(speech_analysis.get("pause_count", 0) or 0)

        pace_score = self._pace_score(words_per_minute) if duration_seconds > 0 else 78.0
        filler_score = self._filler_score(filler_count, filler_rate, pauses)
        length_score = self._length_score(word_count or len(self._tokenize(self._normalize_text(answer_text))))
        combined = 0.4 * pace_score + 0.35 * filler_score + 0.25 * length_score
        return round(max(0.0, min(100.0, combined)), 2)

    def _length_based_score(self, answer_text: str) -> float:
        word_count = len(self._tokenize(self._normalize_text(answer_text)))
        return round(max(60.0, min(100.0, self._length_score(word_count))), 2)

    def _pace_score(self, words_per_minute: float) -> float:
        if words_per_minute <= 0:
            return 75.0
        if words_per_minute < 85:
            return max(20.0, 100.0 - (85 - words_per_minute) * 1.5)
        if words_per_minute <= 155:
            return 100.0
        return max(15.0, 100.0 - (words_per_minute - 155) * 1.5)

    def _filler_score(self, filler_count: float, filler_rate: float, pauses: float = 0.0) -> float:
        score = 100.0
        score -= min(filler_count * 10.0, 50.0)
        score -= min(filler_rate * 250.0, 40.0)
        score -= min(pauses * 5.0, 20.0)
        return max(10.0, score)

    def _length_score(self, word_count: float) -> float:
        if word_count <= 0:
            return 50.0
        if word_count < 20:
            return 45.0 + word_count * 1.5
        if word_count <= 90:
            return 100.0
        if word_count <= 140:
            return max(80.0, 100.0 - (word_count - 90) * 0.6)
        return max(50.0, 70.0 - (word_count - 140) * 0.35)

    def _count_fillers_with_breakdown(self, transcript: str) -> tuple[dict[str, int], int]:
        working = transcript.lower()
        breakdown = {}
        count = 0
        for filler in sorted(FILLER_PHRASES, key=len, reverse=True):
            pattern = rf"\b{re.escape(filler)}\b"
            matches = re.findall(pattern, working)
            if matches:
                breakdown[filler] = len(matches)
                count += len(matches)
                working = re.sub(pattern, " ", working)
        return breakdown, count

    def _bounded_number(self, value: Any, maximum: float) -> float:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return 0.0
        if not math.isfinite(number):
            return 0.0
        return max(0.0, min(maximum, number))

    def _pause_gaps(self, timestamps: Any, duration: float) -> list[float]:
        if not isinstance(timestamps, list) or duration <= 0:
            return []

        safe_times = [
            self._bounded_number(value, maximum=duration)
            for value in timestamps[:500]
        ]
        safe_times = sorted(set(safe_times))
        pauses: list[float] = []
        previous: float | None = None
        for current in safe_times:
            if previous is not None:
                gap = current - previous
                if gap > 2.0:
                    pauses.append(gap)
            previous = current
        return pauses

    def _normalize_text(self, text: str) -> str:
        cleaned = text.lower()
        cleaned = re.sub(r"[^a-z0-9'\s-]", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned.strip()

    def _tokenize(self, text: str) -> list[str]:
        return [token for token in text.split() if token]
