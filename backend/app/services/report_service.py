import math

from app.services.readiness_service import build_assessment_summary


class ReportService:
    def generate_report(
        self,
        interview_data: dict,
        answers_data: list[dict],
        score_data: dict,
        webcam_summary: dict | None = None
    ) -> dict:
        overall_score = self._safe_number(score_data.get("overall_score", 0))
        communication_score = self._safe_number(score_data.get("communication_score", 0))
        
        wpms = []
        pause_counts = []
        for ans in answers_data:
            if not isinstance(ans, dict):
                continue
            speech = ans.get("speech_analysis") or {}
            if isinstance(speech, dict) and self._safe_number(speech.get("duration_seconds", 0)) > 0:
                wpms.append(self._safe_number(speech.get("words_per_minute", 0)))
                pause_counts.append(max(0, int(self._safe_number(speech.get("pause_count", 0)))))
        
        avg_wpm = sum(wpms) / len(wpms) if wpms else 0

        measured_webcam = webcam_summary or {}
        webcam_parts = []
        for key, label, suffix in (
            ("average_face_visibility_pct", "Face detection coverage", "%"),
            ("average_centered_frame_pct", "Face centered in frame", "%"),
            ("average_head_movement_index", "Relative head movement index", ""),
        ):
            value = measured_webcam.get(key)
            if value is not None:
                webcam_parts.append(f"{label}: {float(value):.1f}{suffix}")
        webcam_text = (
            f"Approximate local webcam tracking from {measured_webcam.get('answers_with_metrics', 0)} answers: "
            + "; ".join(webcam_parts)
            if webcam_parts
            else "No webcam metrics were recorded for this session."
        )
            
        strengths = score_data.get("strengths", [])
        weaknesses = score_data.get("weaknesses", [])
        recommendations = score_data.get("recommendations", [])
        
        questions = interview_data.get("questions", []) or []
        question_scores = score_data.get("question_scores", [])
        if not question_scores:
            answer_ids = {answer.get("question_id") for answer in answers_data if isinstance(answer, dict) and str(answer.get("answer_text") or "").strip()}
            question_scores = [
                {"answer_status": "answered" if question.get("question_id") in answer_ids else "unanswered", "difficulty": question.get("difficulty", "unknown")}
                for question in questions if isinstance(question, dict)
            ]
        assessment = build_assessment_summary(overall_score, question_scores)
        total_questions = assessment["total_questions"] or len(questions)
        answered_questions = assessment["answered_questions"]
        unanswered_questions = max(0, total_questions - answered_questions - assessment["skipped_questions"])
        return {
            "Performance": f"{overall_score:.1f}/100 — {assessment['readiness_category']}",
            "Completion": f"{answered_questions} of {total_questions} questions answered ({assessment['completion_percentage']:.1f}%). {assessment['assessment_reliability']}: {assessment['assessment_note']}",
            "Scoring Rubric": assessment["scoring_rubric"],
            "Interview Difficulty Analysis": self._difficulty_summary(interview_data, question_scores),
            "Executive Summary": (
                f"Practice performance: {overall_score:.1f}/100. Readiness category: {assessment['readiness_category']}. "
                + (f"{unanswered_questions} question(s) were unanswered. " if unanswered_questions else "")
                + "This score is coaching feedback, not a prediction of hiring outcomes."
            ),
            "Communication": (
                f"Communication score: {communication_score:.1f}/100. "
                + (f"Average browser-estimated speaking rate: {avg_wpm:.1f} WPM." if wpms else "Voice timing was not recorded.")
                + (f" Pause count: {sum(pause_counts)}." if pause_counts else "")
            ),
            "Technical": f"{answered_questions} of {total_questions} interview question(s) were answered. See per-question evaluations for detail.",
            "Body Language": webcam_text,
            "Strengths": strengths,
            "Weaknesses": weaknesses,
            "Recommendations": recommendations,
        }

    def _difficulty_summary(self, interview_data: dict, question_scores: list[dict]) -> dict:
        state = interview_data.get("difficulty") or {"initial": "medium", "current": "medium", "mode": "adaptive", "history": []}
        grouped: dict[str, list[float]] = {}
        counts: dict[str, dict[str, int]] = {}
        for row in question_scores:
            level = str(row.get("difficulty") or "unknown")
            counts.setdefault(level, {"answered": 0, "partial": 0, "interrupted": 0, "skipped": 0, "unanswered": 0, "evaluation_failed": 0})
            status = row.get("answer_status", "unanswered")
            if status in counts[level]: counts[level][status] += 1
            if status in {"answered", "partial", "interrupted"} and row.get("score") is not None:
                try: grouped.setdefault(level, []).append(float(row["score"]))
                except (TypeError, ValueError): pass
        current = state.get("current", "medium")
        current_average = (sum(grouped[current]) / len(grouped[current])) if grouped.get(current) else None
        recommended = current
        if current_average is not None and current_average >= 80:
            recommended = {"low": "medium", "medium": "hard", "hard": "hard"}.get(current, current)
        averages = {level: (sum(values) / len(values)) for level, values in grouped.items() if values}
        difficulty_rank = {"low": 1, "easy": 1, "medium": 2, "hard": 3}
        attempted_levels = [level for level, counts_for_level in counts.items() if any(counts_for_level[key] for key in ("answered", "partial", "interrupted"))]
        highest_attempted = max(attempted_levels, key=lambda level: difficulty_rank.get(level, 0), default=None)
        strongest = max(averages, key=averages.get, default=None)
        lowest_observed = min(averages, key=averages.get, default=None)
        all_scores = [score for values in grouped.values() for score in values]
        consistency = None
        if len(all_scores) > 1:
            mean_score = sum(all_scores) / len(all_scores)
            consistency = round(math.sqrt(sum((score - mean_score) ** 2 for score in all_scores) / len(all_scores)), 1)
        return {
            "initial_difficulty": state.get("initial", "medium"),
            "mode": state.get("mode", "adaptive"),
            "final_difficulty": state.get("current", "medium"),
            "progression": state.get("history", []),
            "by_difficulty": {level: {"average_score": round(sum(grouped[level]) / len(grouped[level]), 1) if grouped.get(level) else None, "evaluated": len(grouped.get(level, [])), **counts[level]} for level in counts},
            "recommended_practice_difficulty": recommended,
            "highest_attempted_difficulty": highest_attempted,
            "strongest_observed_difficulty": strongest,
            "lowest_average_observed_difficulty": lowest_observed,
            "score_standard_deviation": consistency,
            "note": "Difficulty and answer scores are practice signals, not a validated hiring prediction.",
        }

    def _safe_number(self, value) -> float:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return 0.0
        return number if math.isfinite(number) else 0.0
