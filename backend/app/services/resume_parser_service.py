from __future__ import annotations

import re
from typing import Any


SECTION_ALIASES = {
    "summary": "summary",
    "profile": "profile",
    "objective": "objective",
    "education": "education",
    "academic background": "education",
    "projects": "projects",
    "project experience": "projects",
    "experience": "experience",
    "professional experience": "experience",
    "work experience": "experience",
    "internships": "internships",
    "internship experience": "internships",
    "skills": "skills",
    "technical skills": "skills",
    "core skills": "skills",
    "certifications": "certifications",
    "certificates": "certifications",
    "tools": "tools",
    "technical tools": "tools",
}

DEGREE_HINTS = (
    "bachelor",
    "master",
    "mba",
    "phd",
    "b.tech",
    "btech",
    "m.tech",
    "associate",
    "diploma",
    "be ",
    "bs ",
    "ms ",
    "ba ",
    "msc",
)

TECHNICAL_SPLIT_PATTERN = re.compile(r"[,;/|]+")
YEAR_PATTERN = re.compile(r"(19|20)\d{2}")
PROJECT_PREFIX_PATTERN = re.compile(r"^(project|app|platform|system|tool|dashboard|portal)\b", re.IGNORECASE)
BULLET_PATTERN = re.compile(r"^\s*[-*•\u2022]+\s*")


class ResumeParserService:
    def parse(self, raw_text: str) -> dict[str, Any]:
        lines = [self._clean_line(line) for line in raw_text.splitlines()]
        section_map = self._bucket_sections(lines)

        skills = self._collect_unique_items(
            self._split_items(section_map.get("skills", [])),
        )
        tools = self._collect_unique_items(
            self._split_items(section_map.get("tools", [])),
        )
        certifications = self._collect_unique_items(
            self._split_items(section_map.get("certifications", [])),
        )

        projects = self._parse_project_like_section(section_map.get("projects", []))
        internships = self._parse_experience_section(section_map.get("internships", []), "internship")
        experience = self._parse_experience_section(section_map.get("experience", []), "experience")
        education = self._parse_education_section(section_map.get("education", []))

        summary_lines = self._collect_unique_items(
            self._split_items(
                section_map.get("summary", [])
                + section_map.get("profile", [])
                + section_map.get("objective", [])
            ),
        )

        return {
            "education": education,
            "projects": projects,
            "internships": internships,
            "experience": experience,
            "skills": skills,
            "certifications": certifications,
            "tools": tools,
            "summary_lines": summary_lines,
            "raw_sections": section_map,
        }

    def _bucket_sections(self, lines: list[str]) -> dict[str, list[str]]:
        section_map: dict[str, list[str]] = {
            "summary": [],
            "profile": [],
            "objective": [],
        }
        current_section = "summary"

        for line in lines:
            if not line:
                continue

            heading = self._normalize_heading(line)
            if heading:
                current_section = heading
                section_map.setdefault(current_section, [])
                continue

            section_map.setdefault(current_section, []).append(line)

        return section_map

    def _normalize_heading(self, line: str) -> str | None:
        heading = re.sub(r"[:\-]+$", "", line.strip().lower())
        heading = re.sub(r"\s+", " ", heading)
        return SECTION_ALIASES.get(heading)

    def _clean_line(self, line: str) -> str:
        return re.sub(r"\s+", " ", line.replace("\xa0", " ")).strip()

    def _split_items(self, lines: list[str]) -> list[str]:
        items: list[str] = []
        current: list[str] = []

        for line in lines:
            if not line:
                if current:
                    items.append(" ".join(current).strip())
                    current = []
                continue

            cleaned = BULLET_PATTERN.sub("", line).strip()
            if not cleaned:
                continue

            if self._looks_like_new_item(cleaned) and current:
                items.append(" ".join(current).strip())
                current = [cleaned]
                continue

            current.append(cleaned)

        if current:
            items.append(" ".join(current).strip())

        return [item for item in items if item]

    def _looks_like_new_item(self, line: str) -> bool:
        if PROJECT_PREFIX_PATTERN.match(line):
            return True
        if line.count("  ") > 1:
            return True
        return bool(re.match(r"^[A-Z][^,]{2,80}(:| - )", line))

    def _collect_unique_items(self, items: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in items:
            for part in TECHNICAL_SPLIT_PATTERN.split(item):
                cleaned = self._clean_phrase(part)
                key = self._normalize_key(cleaned)
                if cleaned and key not in seen:
                    seen.add(key)
                    result.append(cleaned)
        return result

    def _clean_phrase(self, value: str) -> str:
        cleaned = re.sub(r"^[\-\*\u2022•\d\.\)\(]+", "", value).strip()
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned

    def _normalize_key(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", value.lower())

    def _parse_project_like_section(self, lines: list[str]) -> list[dict[str, Any]]:
        entries = self._split_items(lines)
        parsed: list[dict[str, Any]] = []

        for entry in entries:
            technologies = self._extract_technologies(entry)
            title, description = self._split_title_and_description(entry)
            parsed.append(
                {
                    "name": title,
                    "description": description,
                    "technologies": technologies,
                    "highlights": self._extract_highlights(entry),
                    "raw_text": entry,
                }
            )

        return parsed

    def _parse_experience_section(self, lines: list[str], default_label: str) -> list[dict[str, Any]]:
        entries = self._split_items(lines)
        parsed: list[dict[str, Any]] = []

        for entry in entries:
            technologies = self._extract_technologies(entry)
            title, description = self._split_title_and_description(entry)
            parsed.append(
                {
                    "title": title or default_label.title(),
                    "company": self._extract_company(entry),
                    "description": description,
                    "technologies": technologies,
                    "highlights": self._extract_highlights(entry),
                    "raw_text": entry,
                }
            )

        return parsed

    def _parse_education_section(self, lines: list[str]) -> list[dict[str, Any]]:
        entries = self._split_items(lines)
        parsed: list[dict[str, Any]] = []
        for entry in entries:
            parsed.append(
                {
                    "institution": self._extract_institution(entry),
                    "degree": self._extract_degree(entry),
                    "year": self._extract_year(entry),
                    "text": entry,
                }
            )
        return parsed

    def _extract_technologies(self, text: str) -> list[str]:
        tech_match = re.search(
            r"(tech stack|technologies|built with|using|stack|tools?)\s*[:\-]\s*(.+)",
            text,
            flags=re.IGNORECASE,
        )
        if tech_match:
            payload = tech_match.group(2)
        else:
            payload = text

        candidates = self._split_items([payload])
        return self._collect_unique_items(candidates)

    def _extract_highlights(self, text: str) -> list[str]:
        sentences = re.split(r"(?<=[.!?])\s+|\s+\|\s+", text)
        highlights = [self._clean_phrase(sentence) for sentence in sentences if self._clean_phrase(sentence)]
        return highlights[:4]

    def _split_title_and_description(self, text: str) -> tuple[str, str]:
        if ":" in text:
            head, tail = text.split(":", 1)
            return self._clean_phrase(head), self._clean_phrase(tail)
        if " - " in text:
            head, tail = text.split(" - ", 1)
            return self._clean_phrase(head), self._clean_phrase(tail)

        words = text.split()
        title = " ".join(words[:6]) if len(words) > 6 else text
        return self._clean_phrase(title), self._clean_phrase(text)

    def _extract_company(self, text: str) -> str:
        match = re.search(r"\b(at|for)\b\s+([A-Z][A-Za-z0-9&.\- ]{2,60})", text)
        if match:
            return self._clean_phrase(match.group(2))
        return ""

    def _extract_institution(self, text: str) -> str:
        match = re.search(r"([A-Z][A-Za-z0-9&.\- ]{2,80})\s+\(?\d{4}\)?", text)
        if match:
            return self._clean_phrase(match.group(1))
        return self._split_title_and_description(text)[0]

    def _extract_degree(self, text: str) -> str:
        lowered = text.lower()
        for hint in DEGREE_HINTS:
            if hint in lowered:
                return self._clean_phrase(text)
        return ""

    def _extract_year(self, text: str) -> str:
        match = YEAR_PATTERN.search(text)
        return match.group(0) if match else ""
