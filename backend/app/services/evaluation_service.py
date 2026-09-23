from __future__ import annotations

import re
from statistics import mean
from typing import Any

from app.ai.embeddings import cosine_similarity_score
from app.services.speech_service import SpeechService


class EvaluationService:
    def __init__(self, speech_service: SpeechService | None = None):
        self.speech_service = speech_service or SpeechService()

    def evaluate_question(
        self,
        question: dict[str, Any],
        answer_text: str,
        speech_analysis: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        expected_answer = str(question.get("expected_answer", "")).strip()
        expected_points = self._normalize_points(question.get("expected_points", question.get("key_points", [])))
        question_text = str(question.get("question", "")).strip()
        topic_focus = str(question.get("topic_focus", question.get("skill", ""))).strip()

        semantic_similarity = cosine_similarity_score(
            " ".join(part for part in [expected_answer, " ".join(expected_points)] if part).strip(),
            answer_text,
        )
        relevance_similarity = cosine_similarity_score(
            " ".join(part for part in [question_text, topic_focus] if part).strip(),
            answer_text,
        )

        matched_points, missing_points, keyword_coverage = self._score_expected_points(expected_points, answer_text)
        matched_point_values = matched_points["items"]
        missing_point_values = missing_points["items"]
        completeness_ratio = len(matched_point_values) / len(expected_points) if expected_points else 0.0
        communication_score = self.speech_service.communication_score(speech_analysis, answer_text)

        structure_score = self._score_structure(answer_text)
        confidence_score = self._score_confidence(answer_text)
        technical_depth = self._score_technical_depth(answer_text, expected_points)

        final_score = self._combine_scores(
            semantic_similarity=semantic_similarity,
            completeness_score=completeness_ratio,
            relevance_score=relevance_similarity,
            keyword_coverage=keyword_coverage,
            communication_score=communication_score / 100.0,
            structure_score=structure_score,
            confidence_score=confidence_score,
            technical_depth=technical_depth,
        )

        return {
            "score": final_score,
            "semantic_score": round(semantic_similarity * 100, 2),
            "completeness_score": round(completeness_ratio * 100, 2),
            "relevance_score": round(relevance_similarity * 100, 2),
            "keyword_coverage": round(keyword_coverage * 100, 2),
            "communication_score": communication_score,
            "structure_score": round(structure_score * 100, 2),
            "confidence_score": round(confidence_score * 100, 2),
            "technical_depth_score": round(technical_depth * 100, 2),
            "matched_points": matched_point_values,
            "missing_points": missing_point_values,
            "expected_points": expected_points,
            "answer_quality": self._answer_quality(answer_text),
            "speech_analysis": speech_analysis or {},
        }

    def score_answer(
        self,
        expected_answer: str,
        key_points: list[str],
        answer_text: str,
        question_text: str = "",
        topic_focus: str = "",
        speech_analysis: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        question = {
            "expected_answer": expected_answer,
            "expected_points": key_points,
            "question": question_text,
            "topic_focus": topic_focus,
        }
        return self.evaluate_question(question, answer_text, speech_analysis=speech_analysis)

    def score_from_questions_and_answers(
        self,
        questions: list[dict],
        answers: list[dict],
    ) -> tuple[list[dict], float, float]:
        answers_by_question = {answer["question_id"]: answer for answer in answers}
        question_scores: list[dict] = []
        scores: list[float] = []
        communication_scores: list[float] = []

        for question in questions:
            answer = answers_by_question.get(question["question_id"])
            evaluation = answer.get("evaluation", {}) if answer else {}
            final_score = float(evaluation.get("score", answer.get("score", 0) if answer else 0.0))
            communication_score = float(
                evaluation.get("communication_score", answer.get("communication_score", 0) if answer else 0.0)
            )
            question_scores.append(
                {
                    "question_id": question["question_id"],
                    "skill": question.get("skill", "General"),
                    "difficulty": question.get("difficulty", "medium"),
                    "question_type": question.get("question_type", "conceptual"),
                    "topic_focus": question.get("topic_focus", question.get("skill", "General")),
                    "score": round(final_score, 2),
                    "semantic_score": float(
                        evaluation.get("semantic_score", answer.get("semantic_score", 0) if answer else 0.0)
                    ),
                    "completeness_score": float(
                        evaluation.get("completeness_score", answer.get("completeness_score", 0) if answer else 0.0)
                    ),
                    "relevance_score": float(
                        evaluation.get("relevance_score", answer.get("relevance_score", 0) if answer else 0.0)
                    ),
                    "keyword_coverage": float(evaluation.get("keyword_coverage", 0)),
                    "communication_score": communication_score,
                    "structure_score": float(evaluation.get("structure_score", answer.get("structure_score", 0) if answer else 0.0)),
                    "confidence_score": float(evaluation.get("confidence_score", answer.get("confidence_score", 0) if answer else 0.0)),
                    "technical_depth_score": float(evaluation.get("technical_depth_score", answer.get("technical_depth_score", 0) if answer else 0.0)),
                    "matched_points": list(
                        evaluation.get("matched_points", answer.get("matched_points", []) if answer else [])
                    ),
                    "missing_points": list(
                        evaluation.get("missing_points", answer.get("missing_points", []) if answer else [])
                    ),
                    "expected_points": list(question.get("expected_points", question.get("key_points", []))),
                    "expected_answer": question.get("expected_answer", ""),
                    "answer_text": answer["answer_text"] if answer else "",
                    "transcript": answer.get("transcript", answer["answer_text"] if answer else ""),
                    "answer_quality": evaluation.get("answer_quality", 0),
                    "speech_analysis": evaluation.get("speech_analysis", answer.get("speech_analysis", {}) if answer else {}),
                }
            )
            scores.append(final_score)
            communication_scores.append(communication_score)

        overall_score = round(mean(scores), 2) if scores else 0.0
        average_communication_score = round(mean(communication_scores), 2) if communication_scores else 0.0
        return question_scores, overall_score, average_communication_score

    def _combine_scores(
        self,
        *,
        semantic_similarity: float,
        completeness_score: float,
        relevance_score: float,
        keyword_coverage: float,
        communication_score: float,
        structure_score: float,
        confidence_score: float,
        technical_depth: float,
    ) -> float:
        combined = (
            0.20 * semantic_similarity
            + 0.15 * completeness_score
            + 0.10 * relevance_score
            + 0.10 * communication_score
            + 0.10 * keyword_coverage
            + 0.15 * structure_score
            + 0.05 * confidence_score
            + 0.15 * technical_depth
        )
        return round(max(0.0, min(1.0, combined)) * 100, 2)

    def _score_expected_points(self, expected_points: list[str], answer_text: str) -> tuple[dict[str, Any], dict[str, Any], float]:
        if not expected_points or not answer_text.strip():
            return {"ratio": 0.0, "items": []}, {"ratio": 1.0 if expected_points else 0.0, "items": expected_points}, 0.0

        matched: list[str] = []
        missing: list[str] = []
        keyword_hits = 0

        for point in expected_points:
            point_score = self._point_similarity(point, answer_text)
            if point_score >= 0.55 or self._contains_keywords(point, answer_text):
                matched.append(point)
                keyword_hits += 1
            else:
                missing.append(point)

        coverage_ratio = keyword_hits / len(expected_points) if expected_points else 0.0
        matched_ratio = len(matched) / len(expected_points) if expected_points else 0.0
        return (
            {"ratio": matched_ratio, "items": matched},
            {"ratio": 1.0 - matched_ratio, "items": missing},
            coverage_ratio,
        )

    def _point_similarity(self, point: str, answer_text: str) -> float:
        normalized_point = self._normalize_text(point)
        normalized_answer = self._normalize_text(answer_text)
        if not normalized_point or not normalized_answer:
            return 0.0
        return cosine_similarity_score(normalized_point, normalized_answer)

    def _contains_keywords(self, point: str, answer_text: str) -> bool:
        point_tokens = [token for token in self._normalize_text(point).split() if len(token) > 2]
        answer_text = self._normalize_text(answer_text)
        if not point_tokens or not answer_text:
            return False
        return sum(token in answer_text for token in point_tokens) >= max(1, len(point_tokens) // 2)

    def _normalize_points(self, points: list[Any]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for point in points:
            cleaned = self._normalize_text(str(point))
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                normalized.append(cleaned)
        return normalized

    def _normalize_text(self, value: str) -> str:
        cleaned = value.lower().strip()
        cleaned = re.sub(r"[^a-z0-9+\s-]", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned

    def _answer_quality(self, answer_text: str) -> float:
        if not answer_text.strip():
            return 0.0
        words = self._normalize_text(answer_text).split()
        if not words:
            return 0.0
        length_score = min(len(words) / 60.0, 1.0)
        sentence_count = max(1, len(re.findall(r"[.!?]", answer_text)))
        structure_score = min(sentence_count / 3.0, 1.0)
        return round((0.6 * length_score + 0.4 * structure_score) * 100, 2)

    def _score_structure(self, answer_text: str) -> float:
        text = answer_text.lower()
        score = 0.5
        if re.search(r'\b(situation|context|problem|initially)\b', text):
            score += 0.125
        if re.search(r'\b(task|goal|objective|needed to)\b', text):
            score += 0.125
        if re.search(r'\b(action|implemented|built|developed|did)\b', text):
            score += 0.125
        if re.search(r'\b(result|outcome|led to|improved|achieved|finally)\b', text):
            score += 0.125
        return min(1.0, score)

    def _score_confidence(self, answer_text: str) -> float:
        text = answer_text.lower()
        hedging_words = ['maybe', 'kind of', 'sort of', 'i think', 'probably', 'possibly', 'just', 'might']
        assertive_words = ['definitely', 'absolutely', 'certainly', 'confident', 'ensured', 'guaranteed', 'resolved', 'successfully']
        
        score = 0.8
        for word in hedging_words:
            if word in text:
                score -= 0.05
        for word in assertive_words:
            if word in text:
                score += 0.05
        return max(0.0, min(1.0, score))

    def _score_technical_depth(self, answer_text: str, expected_points: list[str]) -> float:
        text = answer_text.lower()
        depth_indicators = ['architecture', 'tradeoff', 'scale', 'optimize', 'latency', 'throughput', 'memory', 'async', 'database', 'index', 'cache', 'complexity', 'pattern']
        score = 0.4
        
        hits = sum(1 for ind in depth_indicators if ind in text)
        score += hits * 0.1
        
        _, _, coverage = self._score_expected_points(expected_points, answer_text)
        score += coverage * 0.3
        
        return min(1.0, score)
