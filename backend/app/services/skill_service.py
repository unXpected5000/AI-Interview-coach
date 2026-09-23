from __future__ import annotations

import re
from typing import Any

from app.ai.skill_dictionary import SKILL_ORDER, SKILL_PATTERNS


class SkillService:
    def extract_skills(self, raw_text: str, structured_resume: dict[str, Any] | None = None) -> list[str]:
        normalized_text = self._normalize_text(raw_text)
        found_skills: list[str] = []

        for skill in SKILL_ORDER:
            patterns = SKILL_PATTERNS[skill]
            if any(re.search(pattern, normalized_text, flags=re.IGNORECASE) for pattern in patterns):
                found_skills.append(skill)

        if structured_resume:
            structured_sources = [
                structured_resume.get("skills", []),
                structured_resume.get("tools", []),
                structured_resume.get("certifications", []),
            ]
            for section in structured_sources:
                for item in section or []:
                    self._append_skill(found_skills, str(item))

            for project in structured_resume.get("projects", []):
                self._extract_from_text_blob(found_skills, project.get("raw_text", ""))
                for technology in project.get("technologies", []):
                    self._append_skill(found_skills, str(technology))

            for item in structured_resume.get("internships", []) + structured_resume.get("experience", []):
                self._extract_from_text_blob(found_skills, item.get("raw_text", ""))
                for technology in item.get("technologies", []):
                    self._append_skill(found_skills, str(technology))

        return self._dedupe(found_skills)

    def _normalize_text(self, text: str) -> str:
        text = text.lower()
        text = text.replace("c++", "cpp")
        text = text.replace("c#", "csharp")
        text = re.sub(r"[^a-z0-9+#.\s-]", " ", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _extract_from_text_blob(self, found_skills: list[str], text: str) -> None:
        normalized_text = self._normalize_text(text)
        for skill in SKILL_ORDER:
            patterns = SKILL_PATTERNS[skill]
            if any(re.search(pattern, normalized_text, flags=re.IGNORECASE) for pattern in patterns):
                self._append_skill(found_skills, skill)

    def _append_skill(self, found_skills: list[str], skill: str) -> None:
        cleaned = skill.strip()
        if cleaned:
            found_skills.append(cleaned)

    def _dedupe(self, skills: list[str]) -> list[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for skill in skills:
            key = self._normalize_text(skill)
            if key not in seen:
                seen.add(key)
                deduped.append(skill)
        return deduped
