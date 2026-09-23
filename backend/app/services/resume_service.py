from __future__ import annotations

import fitz
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.models.resume_model import serialize_resume
from app.repositories.resume_repository import ResumeRepository
from app.services.resume_parser_service import ResumeParserService
from app.services.skill_service import SkillService
from app.utils.file_validation import is_pdf_file
from app.ai.llm_client import LLMClient
from app.services.competency_matrix import COMPETENCY_MATRIX
import json


class ResumeService:
    def __init__(
        self,
        resume_repository: ResumeRepository,
        skill_service: SkillService,
        resume_parser_service: ResumeParserService,
        llm_client: LLMClient,
    ):
        self.resume_repository = resume_repository
        self.skill_service = skill_service
        self.resume_parser_service = resume_parser_service
        self.llm_client = llm_client

    async def upload_resume(self, user_id: str, file: UploadFile) -> dict:
        self._validate_upload(file)
        raw_text = self._extract_text_from_pdf(await file.read())
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

    async def list_resumes(self, user_id: str) -> list[dict]:
        documents = await self.resume_repository.list_by_user(user_id)
        return [serialize_resume(document) for document in documents]

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
        return serialize_resume(document)

    async def recommend_roles(self, resume_id: str, user_id: str) -> dict:
        resume = await self.get_resume(resume_id, user_id)
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")
        
        extracted_skills = [s.lower() for s in resume.get("extracted_skills", [])]
        structured = resume.get("structured_resume", {})
        
        candidate_pool = set(extracted_skills)
        for skill in structured.get("skills", []):
            candidate_pool.add(skill.lower())
        for tool in structured.get("tools", []):
            candidate_pool.add(tool.lower())
        for proj in structured.get("projects", []):
            for tech in proj.get("technologies", []):
                candidate_pool.add(tech.lower())
        for exp in structured.get("experience", []) + structured.get("internships", []):
            for tech in exp.get("technologies", []):
                candidate_pool.add(tech.lower())
        
        scores = []
        for role, skills_map in COMPETENCY_MATRIX.items():
            max_score = sum(skills_map.values())
            candidate_score = 0
            for skill, weight in skills_map.items():
                if skill.lower() in candidate_pool:
                    candidate_score += weight
            match_score = (candidate_score / max_score) * 100 if max_score > 0 else 0
            scores.append({"role": role, "match_score": round(match_score, 2)})
            
        scores.sort(key=lambda x: x["match_score"], reverse=True)
        top_roles = scores[:3]
        
        results = []
        for role_data in top_roles:
            role_name = role_data["role"]
            match_score = role_data["match_score"]
            prompt = f"""You are a career advisor. For the role '{role_name}' and the following resume context, provide why it fits, evidence used, missing skills, and a learning roadmap.
            
Return strict JSON:
{{
  "why_it_fits": "string",
  "evidence_used": ["string"],
  "missing_skills": ["string"],
  "learning_roadmap": ["string"]
}}

Candidate keywords: {list(candidate_pool)}
"""
            try:
                response = await self.llm_client.generate(prompt)
                parsed = self.llm_client.parse_json(response)
                results.append({
                    "role": role_name,
                    "match_score": match_score,
                    "why_it_fits": parsed.get("why_it_fits", ""),
                    "evidence_used": parsed.get("evidence_used", []),
                    "missing_skills": parsed.get("missing_skills", []),
                    "learning_roadmap": parsed.get("learning_roadmap", []),
                })
            except Exception:
                results.append({
                    "role": role_name,
                    "match_score": match_score,
                    "why_it_fits": "Good fit based on matching keywords.",
                    "evidence_used": [],
                    "missing_skills": [],
                    "learning_roadmap": [],
                })
        
        return {"resume_id": resume_id, "roles": results}


    def _validate_upload(self, file: UploadFile) -> None:
        if not file.filename or not is_pdf_file(file.filename, file.content_type):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only PDF files are allowed.",
            )

    def _extract_text_from_pdf(self, pdf_bytes: bytes) -> str:
        max_bytes = settings.max_resume_upload_mb * 1024 * 1024
        if len(pdf_bytes) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"PDF exceeds maximum size of {settings.max_resume_upload_mb} MB.",
            )

        try:
            with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
                pages: list[str] = []
                for page in doc:
                    pages.append(page.get_text("text"))
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded file could not be parsed as a valid PDF.",
            ) from exc

        return "\n".join(pages)
