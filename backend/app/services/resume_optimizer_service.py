from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from fastapi import HTTPException, status

from app.ai.llm_client import LLMClient, LLMClientError
from app.ai.prompts import RESUME_OPTIMIZATION_PROMPT
from app.repositories.resume_optimizer_repository import ResumeOptimizerRepository
from app.repositories.resume_repository import ResumeRepository
from app.services.resume_parser_service import ResumeParserService
from app.services.skill_service import SkillService
from app.utils.mongo import make_json_safe


class ResumeOptimizerService:
    def __init__(
        self,
        resume_repository: ResumeRepository,
        optimizer_repository: ResumeOptimizerRepository,
        resume_parser_service: ResumeParserService,
        skill_service: SkillService,
        llm_client: LLMClient,
    ):
        self.resume_repository = resume_repository
        self.optimizer_repository = optimizer_repository
        self.resume_parser_service = resume_parser_service
        self.skill_service = skill_service
        self.llm_client = llm_client

    async def optimize_resume(
        self,
        user_id: str,
        resume_id: str,
        target_role: str,
        company_name: str | None = None,
        job_description: str | None = None,
    ) -> dict:
        resume = await self.resume_repository.get_by_id_and_user(resume_id, user_id)
        if resume is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resume not found.",
            )

        structured_resume = resume.get("structured_resume") or self.resume_parser_service.parse(resume.get("raw_text", ""))
        cache_key = self._build_cache_key(
            resume_id=resume_id,
            target_role=target_role,
            company_name=company_name,
            job_description=job_description,
        )

        cached = await self.optimizer_repository.get_by_cache_key(cache_key, user_id)
        if cached is not None:
            return self._serialize(cached)

        local_result = self._build_local_result(resume, structured_resume, target_role, company_name, job_description)
        prompt = self._build_prompt(resume, structured_resume, target_role, company_name, job_description, local_result)
        result = local_result

        try:
            response_text = await self.llm_client.generate(prompt)
            parsed = self.llm_client.parse_json(response_text)
            result = self._normalize_result(parsed, local_result)
        except (LLMClientError, ValueError, json.JSONDecodeError):
            result = local_result

        document = await self.optimizer_repository.create(
            user_id=user_id,
            resume_id=resume_id,
            target_role=target_role,
            company_name=company_name,
            job_description=job_description,
            cache_key=cache_key,
            result=result,
        )
        return self._serialize(document)

    def _build_prompt(
        self,
        resume: dict[str, Any],
        structured_resume: dict[str, Any],
        target_role: str,
        company_name: str | None,
        job_description: str | None,
        local_result: dict[str, Any],
    ) -> str:
        payload = {
            "target_role": target_role,
            "company_name": company_name,
            "job_description": job_description,
            "resume": {
                "filename": resume.get("filename"),
                "skills": resume.get("extracted_skills", []),
                "structured_resume": {
                    "education": structured_resume.get("education", []),
                    "projects": structured_resume.get("projects", []),
                    "internships": structured_resume.get("internships", []),
                    "experience": structured_resume.get("experience", []),
                    "skills": structured_resume.get("skills", []),
                    "certifications": structured_resume.get("certifications", []),
                    "tools": structured_resume.get("tools", []),
                    "summary_lines": structured_resume.get("summary_lines", []),
                },
            },
            "local_baseline": local_result,
        }
        return f"{RESUME_OPTIMIZATION_PROMPT}\n\nResume analysis:\n{json.dumps(make_json_safe(payload), indent=2)}"

    def _build_local_result(
        self,
        resume: dict[str, Any],
        structured_resume: dict[str, Any],
        target_role: str,
        company_name: str | None,
        job_description: str | None,
    ) -> dict[str, Any]:
        resume_keyword_pool = self._build_resume_keyword_pool(resume, structured_resume)
        target_keywords = self._build_target_keywords(target_role, job_description)
        matched_keywords = self._sorted_unique(resume_keyword_pool.intersection(target_keywords))
        missing_keywords = self._sorted_unique(target_keywords - resume_keyword_pool)

        keyword_coverage = len(matched_keywords) / len(target_keywords) if target_keywords else 0.5
        section_coverage = self._section_coverage(structured_resume)
        ats_score = round(max(0.0, min(1.0, 0.7 * keyword_coverage + 0.3 * section_coverage)) * 100, 2)

        strengths = self._dedupe_sentences(
            [
                f"Resume already reflects {keyword}." for keyword in matched_keywords[:4]
            ]
            + self._section_strengths(structured_resume)
        )
        gaps = self._dedupe_sentences(
            [
                f"Add clearer evidence of {keyword}." for keyword in missing_keywords[:6]
            ]
            + self._section_gaps(structured_resume, target_role, job_description)
        )
        suggested_keywords = self._dedupe_sentences(missing_keywords[:10])
        rewritten_sections = self._build_rewritten_sections(structured_resume, target_role)
        optimized_summary = self._build_optimized_summary(
            resume,
            structured_resume,
            target_role,
            company_name,
            matched_keywords,
        )

        return {
            "score_breakdown": {
                "ats_score": {"score": ats_score, "recommendations": ["Improve keyword density."]},
                "project_quality": {"score": 70.0, "recommendations": ["Highlight project impact."]},
                "technical_depth": {"score": 75.0, "recommendations": ["Add more specific technologies."]},
                "experience_strength": {"score": 80.0, "recommendations": ["Focus on quantifiable achievements."]},
                "impact_statements": {"score": 65.0, "recommendations": ["Use STAR method for bullet points."]},
                "resume_structure": {"score": 85.0, "recommendations": ["Ensure clear section headings."]}
            },
            "strengths": strengths or [f"Profile shows a relevant background for {target_role}."],
            "gaps": gaps or ["Add role-specific keywords and a few more concrete outcomes."],
            "suggested_keywords": suggested_keywords,
            "rewritten_sections": rewritten_sections,
            "optimized_summary": optimized_summary,
        }

    def _normalize_result(self, parsed: dict[str, Any], local_result: dict[str, Any]) -> dict[str, Any]:
        rewritten_sections = parsed.get("rewritten_sections", local_result["rewritten_sections"])
        if not isinstance(rewritten_sections, dict):
            rewritten_sections = local_result["rewritten_sections"]
        normalized_sections = {
            section: self._normalize_list(items) if isinstance(items, list) else self._normalize_list([items])
            for section, items in rewritten_sections.items()
        }
        
        parsed_breakdown = parsed.get("score_breakdown", {})
        local_breakdown = local_result.get("score_breakdown", {})
        
        def _get_category(key: str) -> dict[str, Any]:
            cat = parsed_breakdown.get(key)
            if not isinstance(cat, dict):
                return local_breakdown.get(key, {"score": 0.0, "recommendations": []})
            return {
                "score": float(cat.get("score", local_breakdown.get(key, {}).get("score", 0.0))),
                "recommendations": self._normalize_list(cat.get("recommendations", [])) or local_breakdown.get(key, {}).get("recommendations", [])
            }

        score_breakdown = {
            "ats_score": _get_category("ats_score"),
            "project_quality": _get_category("project_quality"),
            "technical_depth": _get_category("technical_depth"),
            "experience_strength": _get_category("experience_strength"),
            "impact_statements": _get_category("impact_statements"),
            "resume_structure": _get_category("resume_structure"),
        }

        return {
            "score_breakdown": score_breakdown,
            "strengths": self._dedupe_sentences(self._normalize_list(parsed.get("strengths", [])) or local_result["strengths"]),
            "gaps": self._dedupe_sentences(self._normalize_list(parsed.get("gaps", [])) or local_result["gaps"]),
            "suggested_keywords": self._dedupe_sentences(
                self._normalize_list(parsed.get("suggested_keywords", [])) or local_result["suggested_keywords"]
            ),
            "rewritten_sections": normalized_sections,
            "optimized_summary": str(parsed.get("optimized_summary", local_result["optimized_summary"])).strip(),
        }

    def _build_resume_keyword_pool(self, resume: dict[str, Any], structured_resume: dict[str, Any]) -> set[str]:
        keyword_pool: set[str] = set()
        for skill in resume.get("extracted_skills", []):
            keyword_pool.add(self._normalize_keyword(skill))
        for skill in structured_resume.get("skills", []):
            keyword_pool.add(self._normalize_keyword(skill))
        for tool in structured_resume.get("tools", []):
            keyword_pool.add(self._normalize_keyword(tool))
        for certification in structured_resume.get("certifications", []):
            keyword_pool.add(self._normalize_keyword(certification))
        for project in structured_resume.get("projects", []):
            keyword_pool.add(self._normalize_keyword(project.get("name", "")))
            for technology in project.get("technologies", []):
                keyword_pool.add(self._normalize_keyword(technology))
        for item in structured_resume.get("internships", []) + structured_resume.get("experience", []):
            keyword_pool.add(self._normalize_keyword(item.get("title", "")))
            keyword_pool.add(self._normalize_keyword(item.get("company", "")))
            for technology in item.get("technologies", []):
                keyword_pool.add(self._normalize_keyword(technology))

        return {keyword for keyword in keyword_pool if keyword}

    def _build_target_keywords(self, target_role: str, job_description: str | None) -> set[str]:
        tokens = set()
        for value in [target_role, job_description or ""]:
            for part in re.split(r"[,;/|\n]+", value):
                cleaned = self._normalize_keyword(part)
                if cleaned and len(cleaned) > 2:
                    tokens.add(cleaned)
        technical_hits = self.skill_service.extract_skills(job_description or target_role)
        for hit in technical_hits:
            tokens.add(self._normalize_keyword(hit))
        lowered_role = target_role.lower()
        role_maps = {
            "frontend": ["react", "javascript", "typescript", "html", "css", "tailwind"],
            "backend": ["python", "fastapi", "api", "mongodb", "sql"],
            "full stack": ["react", "python", "fastapi", "api", "database"],
            "data": ["python", "sql", "analytics", "numpy", "pandas"],
            "devops": ["docker", "aws", "ci cd", "automation"],
            "mobile": ["react native", "ios", "android", "api"],
        }
        for key, mapped_keywords in role_maps.items():
            if key in lowered_role:
                for keyword in mapped_keywords:
                    tokens.add(self._normalize_keyword(keyword))
        if not tokens:
            tokens.add(self._normalize_keyword(target_role))
        return {token for token in tokens if token}

    def _section_coverage(self, structured_resume: dict[str, Any]) -> float:
        section_count = 0
        if structured_resume.get("projects"):
            section_count += 1
        if structured_resume.get("experience") or structured_resume.get("internships"):
            section_count += 1
        if structured_resume.get("skills"):
            section_count += 1
        if structured_resume.get("education"):
            section_count += 1
        return section_count / 4.0

    def _section_strengths(self, structured_resume: dict[str, Any]) -> list[str]:
        strengths: list[str] = []
        if structured_resume.get("projects"):
            strengths.append("Projects are already documented and can be tailored to the role.")
        if structured_resume.get("experience") or structured_resume.get("internships"):
            strengths.append("Experience section gives room to highlight impact and ownership.")
        if structured_resume.get("skills"):
            strengths.append("Skills section provides a solid base of ATS keywords.")
        if structured_resume.get("education"):
            strengths.append("Education section supports foundational credibility.")
        return strengths

    def _section_gaps(
        self,
        structured_resume: dict[str, Any],
        target_role: str,
        job_description: str | None,
    ) -> list[str]:
        gaps: list[str] = []
        if not structured_resume.get("projects"):
            gaps.append("Add a few project bullets that show practical work relevant to the target role.")
        if not structured_resume.get("experience") and not structured_resume.get("internships"):
            gaps.append("Expand internship or experience details to show execution and ownership.")
        if job_description and len(job_description) > 100:
            gaps.append("Mirror more terms from the job description where they truthfully match the resume.")
        else:
            gaps.append(f"Tailor the summary toward {target_role} using existing experience and projects.")
        return gaps

    def _build_rewritten_sections(self, structured_resume: dict[str, Any], target_role: str) -> dict[str, list[str]]:
        summary_lines = [
            self._rewrite_bullet(line)
            for line in structured_resume.get("summary_lines", [])[:3]
            if str(line).strip()
        ]
        experience_lines = [
            self._rewrite_bullet(item.get("raw_text", item.get("description", "")))
            for item in (structured_resume.get("experience", []) + structured_resume.get("internships", []))[:4]
            if str(item.get("raw_text", item.get("description", ""))).strip()
        ]
        project_lines = [
            self._rewrite_bullet(item.get("raw_text", item.get("description", "")))
            for item in structured_resume.get("projects", [])[:4]
            if str(item.get("raw_text", item.get("description", ""))).strip()
        ]

        if not summary_lines:
            summary_lines = [f"Targeted resume summary for {target_role} using only verified experience."]
        if not experience_lines:
            experience_lines = [f"Highlight relevant ownership and outcomes for {target_role}."]
        if not project_lines:
            project_lines = [f"Highlight projects that support {target_role} responsibilities."]

        return {
            "summary": self._dedupe_sentences(summary_lines),
            "experience": self._dedupe_sentences(experience_lines),
            "projects": self._dedupe_sentences(project_lines),
        }

    def _build_optimized_summary(
        self,
        resume: dict[str, Any],
        structured_resume: dict[str, Any],
        target_role: str,
        company_name: str | None,
        matched_keywords: list[str],
    ) -> str:
        top_keywords = ", ".join(matched_keywords[:4]) if matched_keywords else ", ".join(resume.get("extracted_skills", [])[:4])
        project_names = ", ".join(
            self._dedupe_sentences([project.get("name", "") for project in structured_resume.get("projects", [])[:2]])
        )
        company_clause = f" for {company_name}" if company_name else ""
        summary_parts = [
            f"Candidate targeting {target_role}{company_clause}.",
            f"Relevant strengths include {top_keywords}." if top_keywords else "Relevant strengths are drawn from the existing resume content.",
        ]
        if project_names:
            summary_parts.append(f"Notable projects include {project_names}.")
        return " ".join(summary_parts)

    def _rewrite_bullet(self, text: str) -> str:
        cleaned = self._normalize_sentence(text)
        if not cleaned:
            return ""
        if cleaned[0].islower():
            cleaned = cleaned[0].upper() + cleaned[1:]
        if not re.match(r"^(Built|Implemented|Developed|Led|Created|Designed|Supported|Owned|Contributed)", cleaned):
            cleaned = f"Contributed to {cleaned[0].lower() + cleaned[1:]}"
        return cleaned

    def _build_cache_key(
        self,
        *,
        resume_id: str,
        target_role: str,
        company_name: str | None,
        job_description: str | None,
    ) -> str:
        raw = json.dumps(
            {
                "resume_id": resume_id,
                "target_role": target_role,
                "company_name": company_name or "",
                "job_description": job_description or "",
            },
            sort_keys=True,
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _serialize(self, document: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(document["_id"]),
            "user_id": document["user_id"],
            "resume_id": document["resume_id"],
            "target_role": document["target_role"],
            "company_name": document.get("company_name"),
            "job_description": document.get("job_description"),
            "cache_key": document.get("cache_key"),
            "result": document.get("result", {}),
            "created_at": document.get("created_at"),
        }

    def _normalize_list(self, values: list[Any]) -> list[str]:
        return [str(value).strip() for value in values if str(value).strip()]

    def _dedupe_sentences(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for value in values:
            cleaned = str(value).strip()
            if not cleaned:
                continue
            key = cleaned.lower()
            if key not in seen:
                seen.add(key)
                deduped.append(cleaned)
        return deduped

    def _sorted_unique(self, values: set[str]) -> list[str]:
        return sorted({value for value in values if value})

    def _normalize_keyword(self, value: str) -> str:
        cleaned = re.sub(r"[^a-z0-9+\s-]", " ", value.lower())
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    def _normalize_sentence(self, value: str) -> str:
        cleaned = re.sub(r"\s+", " ", value).strip()
        cleaned = cleaned.rstrip(".")
        return cleaned
