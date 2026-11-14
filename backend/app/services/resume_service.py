from __future__ import annotations

import asyncio

import pymupdf as fitz
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.models.resume_model import serialize_resume
from app.repositories.resume_repository import ResumeRepository
from app.repositories.interview_repository import InterviewRepository
from app.repositories.answer_repository import AnswerRepository
from app.repositories.score_repository import ScoreRepository
from app.repositories.resume_optimizer_repository import ResumeOptimizerRepository
from app.services.resume_parser_service import ResumeParserService
from app.services.skill_service import SkillService
from app.utils.file_validation import is_pdf_file

UPLOAD_CHUNK_BYTES = 256 * 1024


class ResumeService:
    def __init__(
        self,
        resume_repository: ResumeRepository,
        skill_service: SkillService,
        resume_parser_service: ResumeParserService,
        interview_repository: InterviewRepository,
        answer_repository: AnswerRepository,
        score_repository: ScoreRepository,
        optimizer_repository: ResumeOptimizerRepository,
    ):
        self.resume_repository = resume_repository
        self.skill_service = skill_service
        self.resume_parser_service = resume_parser_service
        self.interview_repository = interview_repository
        self.answer_repository = answer_repository
        self.score_repository = score_repository
        self.optimizer_repository = optimizer_repository

    async def upload_resume(self, user_id: str, file: UploadFile) -> dict:
        file_bytes = await self._read_bounded(file)
        self._validate_upload(file, file_bytes)
        # PyMuPDF parsing is CPU-bound; keep it off the async request loop.
        raw_text = await asyncio.to_thread(self._extract_text_from_pdf, file_bytes)
        if not raw_text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to extract text from the uploaded PDF.",
            )

        structured_resume = self.resume_parser_service.parse(raw_text)
        extracted_skills = self.skill_service.extract_skills(raw_text, structured_resume)
        document = await self.resume_repository.create(
            user_id=user_id,
            filename=file.filename or "resume.pdf",
            raw_text=raw_text,
            extracted_skills=extracted_skills,
            structured_resume=structured_resume,
        )
        return serialize_resume(document)

    def _refresh_structure(self, document: dict) -> dict:
        """Re-parse stored text so older uploads benefit from parser improvements."""
        raw_text = document.get("raw_text")
        if not raw_text:
            return document
        structured = self.resume_parser_service.parse(raw_text)
        return {**document, "structured_resume": structured, "extracted_skills": self.skill_service.extract_skills(raw_text, structured)}

    async def list_resumes(self, user_id: str) -> list[dict]:
        documents = await self.resume_repository.list_by_user(user_id)
        return [serialize_resume(self._refresh_structure(document)) for document in documents]

    async def delete_resume(self, resume_id: str, user_id: str) -> None:
        try:
            resume = await self.resume_repository.get_by_id_and_user(resume_id, user_id)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid resume id.") from exc
        if resume is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found.")

        await self.optimizer_repository.delete_by_resume_and_user(resume_id, user_id)
        interview_ids = await self.interview_repository.list_ids_by_resume_and_user(resume_id, user_id)
        await self.answer_repository.delete_by_interview_ids_and_user(interview_ids, user_id)
        await self.score_repository.delete_by_interview_ids_and_user(interview_ids, user_id)
        await self.interview_repository.delete_by_resume_and_user(resume_id, user_id)
        await self.resume_repository.delete_by_id_and_user(resume_id, user_id)

    async def get_resume(self, resume_id: str, user_id: str) -> dict | None:
        try:
            document = await self.resume_repository.get_by_id_and_user(resume_id, user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid resume id.",
            ) from exc
        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resume not found.",
            )
        return serialize_resume(self._refresh_structure(document))

    def _validate_upload(self, file: UploadFile, file_bytes: bytes) -> None:
        if not file.filename or not is_pdf_file(file.filename, file.content_type, file_bytes):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Upload a valid PDF file. The file must have a .pdf name and contain a PDF header.",
            )

    async def _read_bounded(self, file: UploadFile) -> bytes:
        """Read in chunks and stop as soon as the configured limit is exceeded."""
        max_bytes = settings.max_resume_upload_mb * 1024 * 1024
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = await file.read(UPLOAD_CHUNK_BYTES)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail=f"PDF exceeds maximum size of {settings.max_resume_upload_mb} MB.",
                )
            chunks.append(chunk)
        return b"".join(chunks)

    def _extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        max_bytes = settings.max_resume_upload_mb * 1024 * 1024
        if len(pdf_bytes) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"PDF exceeds maximum size of {settings.max_resume_upload_mb} MB.",
            )

        try:
            with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
                pages: list[str] = []
                for index, page in enumerate(doc):
                    if index >= settings.max_resume_pdf_pages:
                        break
                    pages.append(page.get_text("text"))
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded file could not be parsed as a valid PDF.",
            ) from exc

        return "\n".join(pages)
