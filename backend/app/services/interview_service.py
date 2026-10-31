from __future__ import annotations

from fastapi import HTTPException, status

from app.models.interview_model import serialize_interview, serialize_interview_summary
from app.models.answer_model import serialize_answer
from app.models.score_model import serialize_score
from app.repositories.answer_repository import AnswerRepository
from app.repositories.interview_repository import InterviewRepository
from app.repositories.resume_repository import ResumeRepository
from app.repositories.score_repository import ScoreRepository
from app.services.evaluation_service import EvaluationService
from app.services.feedback_service import FeedbackService
from app.services.question_service import QuestionService
from app.services.speech_service import SpeechService
from app.services.report_service import ReportService
from app.services.difficulty_service import next_difficulty, valid_evaluation_scores


class InterviewService:
    def __init__(
        self,
        resume_repository: ResumeRepository,
        interview_repository: InterviewRepository,
        answer_repository: AnswerRepository,
        score_repository: ScoreRepository,
        question_service: QuestionService,
        evaluation_service: EvaluationService,
        feedback_service: FeedbackService,
        speech_service: SpeechService,
        report_service: ReportService,
    ):
        self.resume_repository = resume_repository
        self.interview_repository = interview_repository
        self.answer_repository = answer_repository
        self.score_repository = score_repository
        self.question_service = question_service
        self.evaluation_service = evaluation_service
        self.feedback_service = feedback_service
        self.speech_service = speech_service
        self.report_service = report_service

    async def start_interview(self, user_id: str, resume_id: str, difficulty: str = "medium", difficulty_mode: str = "adaptive") -> dict:
        try:
            resume = await self.resume_repository.get_by_id_and_user(resume_id, user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid resume id.",
            ) from exc
        if resume is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resume not found.",
            )

        existing = await self.interview_repository.get_by_user_and_resume(user_id, resume_id)
        if existing is not None:
            return serialize_interview(existing)

        if difficulty not in {"low", "medium", "hard", "interview_ready"}:
            raise HTTPException(status_code=422, detail="Choose low, medium, hard, or interview_ready difficulty.")
        questions = await self.question_service.generate_questions(resume, {"difficulty": difficulty, "difficulty_mode": difficulty_mode})
        skills = resume.get("extracted_skills", [])
        document = await self.interview_repository.create(
            user_id=user_id,
            resume_id=resume_id,
            skills=skills,
            questions=questions,
            initial_difficulty=difficulty,
            difficulty_mode=difficulty_mode,
        )
        return serialize_interview(document)

    async def get_interview(self, interview_id: str, user_id: str) -> dict:
        try:
            interview = await self.interview_repository.get_by_id_and_user(interview_id, user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid interview id.",
            ) from exc
        if interview is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found.",
            )

        answers = await self.answer_repository.list_by_interview(interview_id, user_id)
        score = await self.score_repository.get_by_interview_and_user(interview_id, user_id)
        legacy_report = score.get("report", {}) if score else {}
        legacy_webcam_summary = score.get("webcam_summary", {}) if score else {}
        if score is not None and score.get("assessment_version", 1) < 2:
            question_scores, overall_score, communication_score = self.evaluation_service.score_from_questions_and_answers(
                interview.get("questions", []), answers
            )
            webcam_summary = self._summarize_webcam(answers)
            refreshed_feedback = self._evidence_feedback(question_scores)
            values = {
                "overall_score": overall_score,
                "communication_score": communication_score,
                "question_scores": question_scores,
                "webcam_summary": webcam_summary,
                "strengths": refreshed_feedback["strengths"],
                "weaknesses": refreshed_feedback["weaknesses"],
                "recommendations": refreshed_feedback["recommendations"],
                "improvement_suggestions": refreshed_feedback["recommendations"],
                "learning_roadmap": refreshed_feedback["learning_roadmap"],
                "report": self.report_service.generate_report(
                    interview_data=interview,
                    answers_data=answers,
                    score_data={**refreshed_feedback, "overall_score": overall_score, "communication_score": communication_score, "question_scores": question_scores},
                    webcam_summary=webcam_summary,
                ),
            }
            score = await self.score_repository.update_assessment(interview_id, user_id, values) or {**score, **values, "assessment_version": 2}
        elif score is not None and (
            "Readiness" in legacy_report
            or "recorded and analyzed" in str(legacy_report.get("Body Language", ""))
            or any(key in legacy_webcam_summary for key in ("average_eye_contact", "average_smile_frequency"))
        ):
            webcam_summary = self._summarize_webcam(answers)
            report = self.report_service.generate_report(
                interview_data=interview,
                answers_data=answers,
                score_data=score,
                webcam_summary=webcam_summary,
            )
            score = await self.score_repository.update_report_and_webcam_summary(
                interview_id, user_id, report, webcam_summary
            ) or score
        if score is not None:
            expected_readiness = serialize_score(score).get("readiness_category")
            saved_performance = str((score.get("report") or {}).get("Performance", ""))
            if expected_readiness and expected_readiness not in saved_performance:
                # Keep persisted report text, JSON downloads and the canonical
                # score label synchronized after rubric/classifier changes.
                webcam_summary = self._summarize_webcam(answers)
                refreshed_report = self.report_service.generate_report(
                    interview_data=interview,
                    answers_data=answers,
                    score_data=score,
                    webcam_summary=webcam_summary,
                )
                score = await self.score_repository.update_report_and_webcam_summary(
                    interview_id, user_id, refreshed_report, webcam_summary
                ) or {**score, "report": refreshed_report, "webcam_summary": webcam_summary}
        return {
            "interview": serialize_interview(interview),
            "answers": [serialize_answer(answer) for answer in answers],
            "score": serialize_score(score) if score else None,
        }

    async def list_interviews(self, user_id: str) -> list[dict]:
        documents = await self.interview_repository.list_by_user(user_id)
        summaries: list[dict] = []
        for document in documents:
            score = await self.score_repository.get_by_interview_and_user(str(document["_id"]), user_id)
            if score is not None and score.get("assessment_version", 1) < 2:
                refreshed = await self.get_interview(str(document["_id"]), user_id)
                score = refreshed.get("score")
            summaries.append(serialize_interview_summary(document, score))
        return summaries

    async def delete_interview(self, interview_id: str, user_id: str) -> None:
        try:
            interview = await self.interview_repository.get_by_id_and_user(interview_id, user_id)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interview id.") from exc
        if interview is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found.")
        await self.answer_repository.delete_by_interview_ids_and_user([interview_id], user_id)
        await self.score_repository.delete_by_interview_ids_and_user([interview_id], user_id)
        await self.interview_repository.delete_by_id_and_user(interview_id, user_id)

    async def submit_answer(
        self,
        interview_id: str,
        user_id: str,
        question_id: int,
        answer_text: str,
        transcript: str | None = None,
        speech_metadata: dict | None = None,
        webcam_metrics: dict | None = None,
        answer_status: str = "answered",
    ) -> dict:
        try:
            interview = await self.interview_repository.get_by_id_and_user(interview_id, user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid interview id.",
            ) from exc
        if interview is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found.",
            )

        if interview.get("status") == "completed" or await self.score_repository.get_by_interview_and_user(interview_id, user_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This interview is already complete and no longer accepts answer changes.",
            )

        question = self._find_question(interview.get("questions", []), question_id)
        if question is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question not found.",
            )

        if not str(answer_text or "").strip() and answer_status != "skipped":
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Submit an answer or explicitly skip the question.")
        if answer_status == "skipped" and str(answer_text or "").strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A skipped question cannot include an answer. Submit it as a partial answer instead.")

        transcript_text = (transcript or "").strip()
        analysis_payload = (
            self.speech_service.build_speech_analysis(transcript_text or answer_text, metadata=speech_metadata)
            if speech_metadata is not None and answer_status != "skipped"
            else None
        )
        if answer_status == "skipped":
            score_payload = {
                "score": 0, "semantic_score": 0, "completeness_score": 0,
                "relevance_score": 0, "keyword_coverage": 0,
                "communication_score": 0, "structure_score": 0,
                "technical_depth_score": None if question.get("question_type") in {"behavioral", "situational"} else 0,
                "matched_points": [], "missing_points": [], "expected_points": [],
                "answer_quality": 0, "speech_analysis": {},
            }
        else:
            try:
                score_payload = self.evaluation_service.evaluate_question(question, answer_text, analysis_payload)
            except Exception:
                # Keep the candidate's answer and make the failed analysis explicit;
                # aggregation will exclude this item instead of treating it as a zero.
                score_payload = {
                    "score": None, "semantic_score": 0, "completeness_score": 0,
                    "relevance_score": 0, "keyword_coverage": 0,
                    "communication_score": 0, "structure_score": 0,
                    "technical_depth_score": None, "matched_points": [],
                    "missing_points": [], "expected_points": [],
                    "answer_quality": 0, "speech_analysis": {},
                    "answer_status": "evaluation_failed",
                }
                answer_status = "evaluation_failed"
        answer_status = answer_status if answer_status in {"answered", "partial", "interrupted", "skipped", "evaluation_failed"} else "answered"
        score_payload["answer_status"] = answer_status
        document = await self.answer_repository.upsert_answer(
            user_id=user_id,
            interview_id=interview_id,
            question_id=question_id,
            answer_text=answer_text,
            transcript=transcript_text,
            semantic_score=score_payload["semantic_score"],
            communication_score=score_payload["communication_score"],
            evaluation=score_payload,
            speech_analysis=analysis_payload,
            webcam_metrics=self._normalize_webcam_metrics(webcam_metrics),
            answer_status=answer_status,
        )
        score = float(score_payload.get("score") or 0)
        saved_questions = list(interview.get("questions", []))
        adapted_question = None
        current_index = next(
            (index for index, item in enumerate(saved_questions) if item.get("question_id") == question_id),
            -1,
        )
        saved_answers = await self.answer_repository.list_by_interview(interview_id, user_id)
        answered_ids = {item.get("question_id") for item in saved_answers}
        next_question = next(
            (
                item for item in saved_questions[current_index + 1 :]
                if item.get("follow_up_for") is None and item.get("question_id") not in answered_ids
            ),
            None,
        )
        difficulty_state = interview.get("difficulty") or {"initial": "medium", "current": "medium", "mode": "adaptive", "history": []}
        reason = None
        target_difficulty = difficulty_state.get("current", "medium")
        if answer_status in {"answered", "partial", "interrupted"} and score_payload.get("score") is not None:
            target_difficulty, reason = next_difficulty(
                difficulty_state.get("current", "medium"),
                difficulty_state.get("mode", "adaptive"),
                valid_evaluation_scores(saved_answers),
            )
            if reason:
                difficulty_state = {**difficulty_state, "current": target_difficulty, "history": [*difficulty_state.get("history", []), {"from": difficulty_state.get("current", "medium"), "to": target_difficulty, "reason": reason, "trigger_question_id": question_id}]}
                await self.interview_repository.update_difficulty(interview_id, user_id, difficulty_state)
        if next_question is not None and reason and difficulty_state.get("mode") == "adaptive" and answer_status in {"answered", "partial", "interrupted"} and score_payload.get("score") is not None:
            adapted_question = await self.question_service.adapt_question(next_question, answer_text, score, target_difficulty=difficulty_state.get("current", "medium"))
            await self.interview_repository.update_question(interview_id, user_id, adapted_question)

        existing_follow_up = next(
            (item for item in saved_questions if item.get("follow_up_for") == question_id),
            None,
        )
        follow_up_count = sum(1 for item in saved_questions if item.get("follow_up_for") is not None)
        follow_up_question = existing_follow_up
        should_follow_up = answer_status in {"answered", "partial", "interrupted"} and score_payload.get("score") is not None and (score < 50 or score >= 80)
        if follow_up_question is None and should_follow_up and follow_up_count < 3:
            next_question_id = max((int(item.get("question_id", 0)) for item in saved_questions), default=0) + 1
            candidate = await self.question_service.generate_follow_up(
                question, answer_text, score_payload, next_question_id,
                target_difficulty=(question.get("difficulty", difficulty_state.get("current", "medium")) if difficulty_state.get("initial") == "interview_ready" else difficulty_state.get("current", "medium")) if difficulty_state.get("mode") == "fixed" else None,
            )
            follow_up_question = await self.interview_repository.add_follow_up_question(
                interview_id, user_id, question_id, candidate
            )

        response = serialize_answer(document)
        if answer_status in {"skipped", "evaluation_failed"}:
            response["difficulty_state"] = difficulty_state
            return response
        response["follow_up_question"] = follow_up_question
        response["adapted_question"] = adapted_question
        response["difficulty_state"] = difficulty_state
        return response

    async def complete_interview(self, interview_id: str, user_id: str) -> dict:
        try:
            interview = await self.interview_repository.get_by_id_and_user(interview_id, user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid interview id.",
            ) from exc
        if interview is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Interview not found.",
            )

        existing_score = await self.score_repository.get_by_interview_and_user(interview_id, user_id)
        if existing_score is not None:
            if interview.get("status") != "completed":
                interview = await self.interview_repository.set_completed(interview_id)
            if existing_score.get("assessment_version", 1) < 2:
                refreshed = await self.get_interview(interview_id, user_id)
                return {"interview": refreshed["interview"], **(refreshed.get("score") or {})}
            return {
                "interview": serialize_interview(interview),
                **serialize_score(existing_score),
            }

        answers = await self.answer_repository.list_by_interview(interview_id, user_id)
        question_scores, computed_overall_score, communication_score = self.evaluation_service.score_from_questions_and_answers(
            interview.get("questions", []),
            answers,
        )
        feedback = await self.feedback_service.generate_feedback(interview.get("questions", []), answers)
        # The final score is derived only from question evaluations, including zeroes for unanswered questions.
        overall_score = float(computed_overall_score)
        
        webcam_summary = self._summarize_webcam(answers)

        score_data_for_report = {
            "overall_score": overall_score,
            "communication_score": communication_score,
            "strengths": feedback.get("strengths", []),
            "weaknesses": feedback.get("weaknesses", []),
            "recommendations": feedback.get("recommendations", feedback.get("improvement_suggestions", [])),
            "improvement_suggestions": feedback.get("improvement_suggestions", feedback.get("recommendations", [])),
            "learning_roadmap": feedback.get("learning_roadmap", []),
            "question_scores": question_scores,
        }
        
        report = self.report_service.generate_report(
            interview_data=interview,
            answers_data=answers,
            score_data=score_data_for_report,
            webcam_summary=webcam_summary,
        )
        
        score_document = await self.score_repository.upsert_score(
            user_id=user_id,
            interview_id=interview_id,
            overall_score=overall_score,
            communication_score=communication_score,
            strengths=feedback.get("strengths", []),
            weaknesses=feedback.get("weaknesses", []),
            recommendations=feedback.get("recommendations", feedback.get("improvement_suggestions", [])),
            improvement_suggestions=feedback.get("improvement_suggestions", feedback.get("recommendations", [])),
            learning_roadmap=feedback.get("learning_roadmap", []),
            question_scores=question_scores,
            webcam_summary=webcam_summary,
            report=report,
        )
        completed_interview = await self.interview_repository.set_completed(interview_id)
        return {
            "interview": serialize_interview(completed_interview),
            **serialize_score(score_document),
        }

    def _summarize_webcam(self, answers: list[dict]) -> dict:
        values: dict[str, list[float]] = {
            "average_face_visibility_pct": [],
            "average_centered_frame_pct": [],
            "average_head_movement_index": [],
        }
        aliases = {
            "average_face_visibility_pct": ("face_visibility_pct",),
            "average_centered_frame_pct": ("centered_frame_pct",),
            "average_head_movement_index": ("head_movement_index",),
        }
        answers_with_metrics = 0
        for answer in answers:
            metrics = answer.get("webcam_metrics") or {}
            had_metric = False
            for target, keys in aliases.items():
                value = next((metrics[key] for key in keys if metrics.get(key) is not None), None)
                try:
                    number = float(value)
                except (TypeError, ValueError):
                    continue
                if not (number == number and abs(number) != float("inf")):
                    continue
                number = max(0.0, min(100.0, number))
                values[target].append(number)
                had_metric = True
            if had_metric:
                answers_with_metrics += 1
        summary = {
            key: round(sum(items) / len(items), 1) if items else None
            for key, items in values.items()
        }
        summary["answers_with_metrics"] = answers_with_metrics
        return summary

    def _evidence_feedback(self, question_scores: list[dict]) -> dict:
        strengths, weaknesses, recommendations, learning_roadmap = [], [], [], []
        for item in question_scores:
            topic = str(item.get("topic_focus") or item.get("skill") or "this topic")
            answer_status = item.get("answer_status")
            if answer_status == "unanswered":
                weaknesses.append(f"No answer was recorded for {topic}.")
                recommendations.append(f"Answer the question about {topic} to receive a performance evaluation.")
            elif answer_status == "skipped":
                weaknesses.append(f"The question about {topic} was skipped.")
                recommendations.append(f"Return to the skipped question about {topic} for practice.")
            elif answer_status == "evaluation_failed":
                weaknesses.append(f"The response about {topic} could not be evaluated.")
                recommendations.append(f"Review the saved response about {topic} when evaluation is available.")
            elif item.get("matched_points") and item.get("score", 0) >= 70:
                strengths.append(f"Covered {item['matched_points'][0]} in the response about {topic}.")
            elif item.get("missing_points"):
                weaknesses.append(f"The response about {topic} did not cover {item['missing_points'][0]}.")
                recommendations.append(f"Add a clear explanation of {item['missing_points'][0]} when answering about {topic}.")
            learning_roadmap.append(f"Review {topic} and practice a concise answer with one concrete example.")
        if not recommendations and question_scores:
            recommendations.append("Practice each answer with a concrete example, a relevant tradeoff, and a clear outcome.")
        if not learning_roadmap:
            learning_roadmap.append("Start a practice interview to receive question-specific coaching.")
        return {
            "strengths": strengths,
            "weaknesses": weaknesses,
            "recommendations": recommendations,
            "learning_roadmap": learning_roadmap,
        }

    def _normalize_webcam_metrics(self, metrics: dict | None) -> dict:
        if not isinstance(metrics, dict):
            return {}
        normalized = {}
        for key in ("face_visibility_pct", "centered_frame_pct", "head_movement_index"):
            value = metrics.get(key)
            if isinstance(value, (int, float)) and value == value and abs(value) != float("inf"):
                normalized[key] = round(max(0.0, min(100.0, float(value))), 2)
        sample_count = metrics.get("sample_count")
        if isinstance(sample_count, int) and not isinstance(sample_count, bool):
            normalized["sample_count"] = max(0, min(sample_count, 300))
            if normalized["sample_count"] == 0:
                return {}
        return normalized

    def _find_question(self, questions: list[dict], question_id: int) -> dict | None:
        for question in questions:
            if int(question.get("question_id")) == int(question_id):
                return question
        return None
