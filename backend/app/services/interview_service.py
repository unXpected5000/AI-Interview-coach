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

    async def start_interview(self, user_id: str, resume_id: str) -> dict:
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

        questions = await self.question_service.generate_questions(resume)
        skills = resume.get("extracted_skills", [])
        document = await self.interview_repository.create(
            user_id=user_id,
            resume_id=resume_id,
            skills=skills,
            questions=questions,
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
            summaries.append(serialize_interview_summary(document, score))
        return summaries

    async def submit_answer(
        self,
        interview_id: str,
        user_id: str,
        question_id: int,
        answer_text: str,
        transcript: str | None = None,
        speech_analysis: dict | None = None,
        webcam_metrics: dict | None = None,
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

        question = self._find_question(interview.get("questions", []), question_id)
        if question is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question not found.",
            )

        transcript_text = (transcript or answer_text).strip()
        analysis_payload = self.speech_service.build_speech_analysis(transcript_text, frontend_data=speech_analysis)
        score_payload = self.evaluation_service.evaluate_question(question, answer_text, analysis_payload)
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
            webcam_metrics=webcam_metrics,
        )
        return serialize_answer(document)

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
            return {
                "interview": serialize_interview(interview),
                **serialize_score(existing_score),
            }

        answers = await self.answer_repository.list_by_interview(interview_id, user_id)
        feedback = await self.feedback_service.generate_feedback(interview.get("questions", []), answers)
        question_scores, computed_overall_score, communication_score = self.evaluation_service.score_from_questions_and_answers(
            interview.get("questions", []),
            answers,
        )
        overall_score = float(feedback.get("overall_score", computed_overall_score))
        
        # Calculate summary for webcam based on answered questions
        webcam_summary = {"status": "present"} if any(a.get("webcam_metrics") for a in answers) else None

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
            report=report,
        )
        completed_interview = await self.interview_repository.set_completed(interview_id)
        return {
            "interview": serialize_interview(completed_interview),
            **serialize_score(score_document),
        }

    def _find_question(self, questions: list[dict], question_id: int) -> dict | None:
        for question in questions:
            if int(question.get("question_id")) == int(question_id):
                return question
        return None
