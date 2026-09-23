from __future__ import annotations

import json
from statistics import mean
from typing import Any

from app.ai.llm_client import LLMClient, LLMClientError
from app.ai.prompts import FEEDBACK_PROMPT
from app.utils.mongo import make_json_safe


class FeedbackService:
    def __init__(self, llm_client: LLMClient):
        self.llm_client = llm_client

    async def generate_feedback(self, questions: list[dict], answers: list[dict]) -> dict:
        scores = [float(answer.get("score", answer.get("semantic_score", 0))) for answer in answers]
        base_score = round(mean(scores) if scores else 0, 2)
        summary = self._build_summary(questions, answers, base_score)
        prompt = self._build_prompt(summary)

        try:
            response_text = await self.llm_client.generate(prompt)
            parsed = self.llm_client.parse_json(response_text)
            return self._normalize_feedback(parsed, base_score, summary)
        except (LLMClientError, ValueError, json.JSONDecodeError):
            return self._fallback_feedback(summary, base_score)

    def _build_prompt(self, summary: dict[str, Any]) -> str:
        payload = make_json_safe(summary)
        return f"{FEEDBACK_PROMPT}\n\nInterview data:\n{json.dumps(payload, indent=2)}"

    def _build_summary(self, questions: list[dict], answers: list[dict], base_score: float) -> dict[str, Any]:
        answers_by_question = {answer.get("question_id"): answer for answer in answers}
        question_summaries: list[dict[str, Any]] = []
        for question in questions:
            answer = answers_by_question.get(question.get("question_id"), {})
            evaluation = answer.get("evaluation", {})
            speech_analysis = evaluation.get("speech_analysis", answer.get("speech_analysis", {}))
            question_summaries.append(
                {
                    "question_id": question.get("question_id"),
                    "skill": question.get("skill", "General"),
                    "topic_focus": question.get("topic_focus", question.get("skill", "General")),
                    "difficulty": question.get("difficulty", "medium"),
                    "question_type": question.get("question_type", "conceptual"),
                    "score": float(evaluation.get("score", answer.get("score", 0) if answer else 0.0)),
                    "semantic_score": float(evaluation.get("semantic_score", answer.get("semantic_score", 0) if answer else 0.0)),
                    "completeness_score": float(evaluation.get("completeness_score", answer.get("completeness_score", 0) if answer else 0.0)),
                    "relevance_score": float(evaluation.get("relevance_score", answer.get("relevance_score", 0) if answer else 0.0)),
                    "matched_points": list(evaluation.get("matched_points", answer.get("matched_points", []) if answer else [])),
                    "missing_points": list(evaluation.get("missing_points", answer.get("missing_points", []) if answer else [])),
                    "answer_text": answer.get("answer_text", ""),
                    "transcript": answer.get("transcript", answer.get("answer_text", "")),
                    "answer_quality": float(evaluation.get("answer_quality", 0)),
                    "communication_score": float(
                        evaluation.get("communication_score", answer.get("communication_score", 0) if answer else 0.0)
                    ),
                    "structure_score": float(evaluation.get("structure_score", answer.get("structure_score", 0) if answer else 0.0)),
                    "confidence_score": float(evaluation.get("confidence_score", answer.get("confidence_score", 0) if answer else 0.0)),
                    "technical_depth_score": float(evaluation.get("technical_depth_score", answer.get("technical_depth_score", 0) if answer else 0.0)),
                    "speech_analysis": speech_analysis,
                }
            )

        strengths = self._build_strength_candidates(question_summaries)
        weaknesses = self._build_weakness_candidates(question_summaries)
        improvement_suggestions = self._build_improvement_suggestions(question_summaries)
        learning_roadmap = self._build_learning_roadmap(question_summaries)

        return {
            "overall_score": base_score,
            "communication_score": self._average_communication(question_summaries),
            "question_summaries": question_summaries,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "improvement_suggestions": improvement_suggestions,
            "learning_roadmap": learning_roadmap,
        }

    def _normalize_feedback(self, parsed: dict, base_score: float, summary: dict[str, Any]) -> dict:
        strengths = self._normalize_list(parsed.get("strengths", [])) or summary["strengths"]
        weaknesses = self._normalize_list(parsed.get("weaknesses", [])) or summary["weaknesses"]
        improvement_suggestions = self._normalize_list(
            parsed.get("improvement_suggestions", parsed.get("recommendations", []))
        ) or summary["improvement_suggestions"]
        learning_roadmap = self._normalize_list(parsed.get("learning_roadmap", [])) or summary["learning_roadmap"]
        
        raw_dimensions = parsed.get("feedback_by_dimension", {})
        feedback_by_dimension = {
            "technical_depth": self._dedupe_sentences(self._normalize_list(raw_dimensions.get("technical_depth", []))),
            "communication": self._dedupe_sentences(self._normalize_list(raw_dimensions.get("communication", []))),
            "structure_and_star": self._dedupe_sentences(self._normalize_list(raw_dimensions.get("structure_and_star", []))),
            "confidence_and_tone": self._dedupe_sentences(self._normalize_list(raw_dimensions.get("confidence_and_tone", []))),
        }

        return {
            "overall_score": float(parsed.get("overall_score", base_score)),
            "communication_score": float(parsed.get("communication_score", summary.get("communication_score", 0))),
            "feedback_by_dimension": feedback_by_dimension,
            "strengths": self._dedupe_sentences(strengths),
            "weaknesses": self._dedupe_sentences(weaknesses),
            "improvement_suggestions": self._dedupe_sentences(improvement_suggestions),
            "learning_roadmap": self._dedupe_sentences(learning_roadmap),
            "recommendations": self._dedupe_sentences(improvement_suggestions),
        }

    def _fallback_feedback(self, summary: dict[str, Any], base_score: float) -> dict:
        return {
            "overall_score": float(base_score),
            "communication_score": float(summary.get("communication_score", 0)),
            "feedback_by_dimension": {
                "technical_depth": ["Focus on the 'why' behind your technical choices."],
                "communication": ["Speak clearly and steadily without rushing."],
                "structure_and_star": ["Frame answers using Situation, Task, Action, Result."],
                "confidence_and_tone": ["Use assertive language instead of hedging."]
            },
            "strengths": self._dedupe_sentences(summary["strengths"] or ["Responses showed some relevant technical grounding."]),
            "weaknesses": self._dedupe_sentences(summary["weaknesses"] or ["Some answers need more topic-specific depth."]),
            "improvement_suggestions": self._dedupe_sentences(summary["improvement_suggestions"] or [
                "Use one concrete example for each answer.",
                "Mention tradeoffs and edge cases when describing technical choices.",
                "Tie answers back to the actual project, tool, or skill being discussed.",
            ]),
            "learning_roadmap": self._dedupe_sentences(summary["learning_roadmap"] or [
                "Review the weakest topics and write short practice answers.",
                "Add one implementation detail and one tradeoff to every response.",
                "Rehearse project explanations before the next interview session.",
            ]),
            "recommendations": self._dedupe_sentences(summary["improvement_suggestions"]),
        }

    def _build_strength_candidates(self, question_summaries: list[dict[str, Any]]) -> list[str]:
        ranked = sorted(question_summaries, key=lambda item: item["score"], reverse=True)
        strengths: list[str] = []
        for item in ranked[:4]:
            if item["matched_points"]:
                strengths.append(self._format_strength(item, item["matched_points"][0]))
            if self._is_clear_speech(item):
                strengths.append(f"Maintained a clear speaking pace while explaining {self._topic_label(item)}.")
            elif item["score"] >= 70:
                strengths.append(f"Handled {self._topic_label(item)} with solid structure.")
        return self._dedupe_sentences(strengths)

    def _build_weakness_candidates(self, question_summaries: list[dict[str, Any]]) -> list[str]:
        ranked = sorted(question_summaries, key=lambda item: item["score"])
        weaknesses: list[str] = []
        for item in ranked[:4]:
            if item["missing_points"]:
                weaknesses.append(self._format_weakness(item, item["missing_points"][0]))
            if self._needs_communication_help(item):
                weaknesses.append(self._communication_issue(item))
            elif item["score"] < 60:
                weaknesses.append(f"{self._topic_label(item)} needs more depth and specific examples.")
        return self._dedupe_sentences(weaknesses)

    def _build_improvement_suggestions(self, question_summaries: list[dict[str, Any]]) -> list[str]:
        suggestions: list[str] = []
        weak_items = sorted(question_summaries, key=lambda item: item["score"])[:3]
        for item in weak_items:
            suggestions.append(
                f"Strengthen {self._topic_label(item)} by covering {self._join_points(item['missing_points']) or 'the missing details'}."
            )
            if self._needs_communication_help(item):
                suggestions.append(
                    f"Slow down slightly when discussing {self._topic_label(item)} and cut filler words."
                )
        suggestions.append("Add one concrete example, one tradeoff, and one outcome to each answer.")
        suggestions.append("Answer with the project, tool, or skill name early so the response stays focused.")
        return self._dedupe_sentences(suggestions)

    def _build_learning_roadmap(self, question_summaries: list[dict[str, Any]]) -> list[str]:
        weakest_topics = [self._topic_label(item) for item in sorted(question_summaries, key=lambda item: item["score"])[:3]]
        roadmap = [
            f"Review {topic} and write a 60-second answer with an example." for topic in weakest_topics if topic
        ]
        roadmap.extend(
            [
                "Practice one scenario-based answer per weak topic.",
                "Revisit the matching project, internship, or certification notes before the next session.",
                "Re-answer the same questions after adding tradeoffs and measurable outcomes.",
            ]
        )
        return self._dedupe_sentences(roadmap)

    def _format_strength(self, item: dict[str, Any], point: str) -> str:
        return f"Correctly explained {self._point_to_topic(point)} while discussing {self._topic_label(item)}."

    def _format_weakness(self, item: dict[str, Any], point: str) -> str:
        return f"Needs more detail on {self._point_to_topic(point)} when covering {self._topic_label(item)}."

    def _point_to_topic(self, point: str) -> str:
        point = str(point).strip().rstrip(".")
        if not point:
            return "the topic"
        return point

    def _topic_label(self, item: dict[str, Any]) -> str:
        return str(item.get("topic_focus") or item.get("skill") or "the topic").strip()

    def _is_clear_speech(self, item: dict[str, Any]) -> bool:
        analysis = item.get("speech_analysis") or {}
        if not analysis:
            return False
        words_per_minute = float(analysis.get("words_per_minute", 0) or 0)
        filler_rate = float(analysis.get("filler_rate", 0) or 0)
        word_count = float(analysis.get("word_count", 0) or 0)
        return 85 <= words_per_minute <= 155 and filler_rate <= 0.03 and word_count >= 25

    def _needs_communication_help(self, item: dict[str, Any]) -> bool:
        analysis = item.get("speech_analysis") or {}
        if not analysis:
            return False
        words_per_minute = float(analysis.get("words_per_minute", 0) or 0)
        filler_count = float(analysis.get("filler_count", 0) or 0)
        filler_rate = float(analysis.get("filler_rate", 0) or 0)
        word_count = float(analysis.get("word_count", 0) or 0)
        return words_per_minute > 165 or words_per_minute < 80 or filler_count >= 3 or filler_rate >= 0.05 or word_count < 25

    def _communication_issue(self, item: dict[str, Any]) -> str:
        analysis = item.get("speech_analysis") or {}
        topic = self._topic_label(item)
        if not analysis:
            return f"{topic} needs a clearer spoken explanation."
        word_count = float(analysis.get("word_count", 0) or 0)
        filler_count = float(analysis.get("filler_count", 0) or 0)
        filler_rate = float(analysis.get("filler_rate", 0) or 0)
        words_per_minute = float(analysis.get("words_per_minute", 0) or 0)
        if word_count < 25:
            return f"The answer on {topic} was too brief to show depth."
        if filler_count >= 3 or filler_rate >= 0.05:
            return f"Frequent filler words reduced clarity when discussing {topic}."
        if words_per_minute > 165:
            return f"Speaking pace was too fast while explaining {topic}."
        if words_per_minute < 80:
            return f"Speaking pace was a bit slow when covering {topic}."
        return f"Communication on {topic} could be a little clearer."

    def _join_points(self, points: list[str]) -> str:
        unique = self._dedupe_sentences(points)
        if not unique:
            return ""
        if len(unique) == 1:
            return unique[0]
        return ", ".join(unique[:2])

    def _average_communication(self, question_summaries: list[dict[str, Any]]) -> float:
        scores = [float(item.get("communication_score", 0)) for item in question_summaries if item.get("communication_score") is not None]
        return round(sum(scores) / len(scores), 2) if scores else 0.0

    def _normalize_list(self, items: list) -> list[str]:
        return [str(item).strip() for item in items if str(item).strip()]

    def _dedupe_sentences(self, items: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in items:
            cleaned = str(item).strip()
            if not cleaned:
                continue
            key = cleaned.lower()
            if key not in seen:
                seen.add(key)
                result.append(cleaned)
        return result
