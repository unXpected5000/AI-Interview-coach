from __future__ import annotations

import re
from typing import Any

from app.ai.skill_dictionary import SKILL_ORDER, SKILL_PATTERNS

# Heading keywords mapped to sections. Headings are matched by keyword, so
# "RELEVANT EXPERIENCE", "Research Experience", "Academic Projects:" and
# "TECHNICAL SKILLS" are all recognised. Order matters: earlier rules win.
HEADING_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("internships", ("internship", "industrial training", "summer training")),
    ("projects", ("project",)),
    ("research", ("research", "publication", "paper")),
    ("experience", ("experience", "employment", "work history", "professional background", "positions held")),
    ("education", ("education", "academic", "qualification", "scholastic")),
    ("skills", ("skill", "competenc", "technolog", "expertise", "proficienc", "technical stack")),
    ("tools", ("tools", "software", "platforms")),
    ("certifications", ("certification", "certificate", "licen", "courses", "coursework", "training")),
    ("achievements", ("achievement", "award", "honor", "honour", "accomplishment")),
    ("activities", ("activit", "leadership", "extracurricular", "extra-curricular", "volunteer", "position of responsibility", "positions of responsibility", "clubs")),
    ("languages", ("language",)),
    ("interests", ("interest", "hobbies", "hobby")),
    ("summary", ("summary", "profile", "objective", "about me", "career goal")),
]
# A "Languages" heading inside skills ("Programming Languages") is a skill group, not spoken languages.
SKILL_GROUP_HINTS = ("programming", "technical", "software", "frameworks", "libraries")

# Whole-word degree markers ("Mumbai" must not match "mba").
DEGREE_PATTERN = re.compile(
    r"\b(bachelor|master|mba|ph\.?\s?d|b\.\s?tech|btech|m\.\s?tech|mtech|b\.\s?e\.?|m\.\s?e\.?|be\s*\(|"
    r"b\.?\s?sc|m\.?\s?sc|bs|ms|b\.?\s?a|m\.?\s?a|associate|diploma|hsc|ssc|12th|10th|xii|cbse|icse|"
    r"higher secondary|secondary school)\b",
    re.IGNORECASE,
)
MONTHS = r"(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|spring|summer|fall|autumn|winter)"
DATE_PATTERN = re.compile(
    rf"(\b{MONTHS}\.?\s*,?\s*(19|20)\d{{2}}\b|\b(19|20)\d{{2}}\s*[-–—to]+\s*((19|20)\d{{2}}|present|current|now)\b|\b(19|20)\d{{2}}\b|\bpresent\b|\bcurrent(ly)?\b)",
    re.IGNORECASE,
)
YEAR_PATTERN = re.compile(r"(19|20)\d{2}")
BULLET_PATTERN = re.compile(r"^\s*[-*••▪●‣⁃◦∙o]\s+")
SKILL_SPLIT_PATTERN = re.compile(r"[,;|••/]+")
LABEL_PREFIX_PATTERN = re.compile(r"^[A-Za-z][A-Za-z &/()+.-]{1,40}:\s*")


class ResumeParserService:
    """Rule-based resume structuring that tolerates common heading styles."""

    def parse(self, raw_text: str) -> dict[str, Any]:
        lines = [self._clean_line(line) for line in raw_text.splitlines()]
        section_map = self._bucket_sections(lines)

        skills = self._parse_skill_lines(section_map.get("skills", []))
        tools = self._parse_skill_lines(section_map.get("tools", []))
        certifications = self._simple_items(section_map.get("certifications", []))
        projects = self._parse_entries(section_map.get("projects", []), kind="project", known_skills=skills + tools)
        internships = self._parse_entries(section_map.get("internships", []), kind="internship", known_skills=skills + tools)
        experience = self._parse_entries(section_map.get("experience", []), kind="work", known_skills=skills + tools)
        experience += self._parse_entries(section_map.get("research", []), kind="research", known_skills=skills + tools)
        education = self._parse_education_section(section_map.get("education", []))
        achievements = self._simple_items(section_map.get("achievements", []))
        activities = self._simple_items(section_map.get("activities", []))
        summary_lines = self._simple_items(section_map.get("summary", []))

        return {
            "education": education,
            "projects": projects,
            "internships": internships,
            "experience": experience,
            "skills": skills,
            "certifications": certifications,
            "tools": tools,
            "achievements": achievements,
            "activities": activities,
            "languages": self._parse_skill_lines(section_map.get("languages", [])),
            "interests": self._parse_skill_lines(section_map.get("interests", [])),
            "summary_lines": summary_lines,
            "raw_sections": section_map,
        }

    # ------------------------------------------------------------ sections

    def _bucket_sections(self, lines: list[str]) -> dict[str, list[str]]:
        section_map: dict[str, list[str]] = {"header": [], "summary": []}
        current_section = "header"
        for line in lines:
            if not line:
                continue
            heading = self._detect_heading(line, current_section)
            if heading:
                current_section = heading
                section_map.setdefault(current_section, [])
                continue
            section_map.setdefault(current_section, []).append(line)
        # Text before the first heading is usually name/contact, then a summary.
        header_lines = section_map.pop("header", [])
        if not section_map["summary"] and len(header_lines) > 3:
            section_map["summary"] = [line for line in header_lines[3:] if len(line.split()) > 6]
        return section_map

    def _detect_heading(self, line: str, current_section: str) -> str | None:
        stripped = line.strip().strip(":").strip()
        words = stripped.split()
        if not words or len(words) > 6 or len(stripped) > 50:
            return None
        if BULLET_PATTERN.match(line) or re.search(r"[.!?,]$", stripped) or DATE_PATTERN.search(stripped):
            return None
        letters = [char for char in stripped if char.isalpha()]
        is_caps = bool(letters) and sum(char.isupper() for char in letters) / len(letters) > 0.8
        is_title = all(word[:1].isupper() or word.lower() in {"and", "of", "&", "in", "for"} for word in words)
        if not (is_caps or line.rstrip().endswith(":") or (is_title and len(words) <= 4)):
            return None
        lowered = stripped.lower()
        for section, keywords in HEADING_RULES:
            if any(keyword in lowered for keyword in keywords):
                if section == "languages" and any(hint in lowered for hint in SKILL_GROUP_HINTS):
                    return "skills"
                # Inside a section, title-case lines ("Undergraduate Researcher",
                # "Project Lead") are roles; only CAPS or "Heading:" lines start sections.
                if not is_caps and not line.rstrip().endswith(":") and current_section not in {"header", "summary"}:
                    return None
                return section
        return None

    def _clean_line(self, line: str) -> str:
        return re.sub(r"\s+", " ", line.replace("\xa0", " ")).strip()

    # ------------------------------------------------------------ skills

    def _parse_skill_lines(self, lines: list[str]) -> list[str]:
        # Re-join wrapped lines ("..., Microsoft" + "Office") into one list per label.
        groups: list[str] = []
        for line in lines:
            content = BULLET_PATTERN.sub("", line).strip()
            starts_group = bool(LABEL_PREFIX_PATTERN.match(content)) or bool(BULLET_PATTERN.match(line)) or not groups
            if starts_group or re.search(r"[,;|]$", groups[-1]):
                groups.append(content) if starts_group else groups.__setitem__(-1, f"{groups[-1]} {content}")
            else:
                groups[-1] = f"{groups[-1]} {content}"
        items: list[str] = []
        for content in groups:
            content = LABEL_PREFIX_PATTERN.sub("", content)  # "Technical: SolidWorks, ..." -> "SolidWorks, ..."
            for part in SKILL_SPLIT_PATTERN.split(content):
                cleaned = re.sub(r"\(.*?\)", "", part).strip(" .-:")
                # Skills are short phrases; long fragments are sentences, not skills.
                if cleaned and len(cleaned.split()) <= 4 and len(cleaned) <= 40:
                    items.append(cleaned)
        return self._unique(items)

    def _simple_items(self, lines: list[str]) -> list[str]:
        items: list[str] = []
        current: list[str] = []
        for line in lines:
            if BULLET_PATTERN.match(line) and current:
                items.append(" ".join(current))
                current = []
            current.append(BULLET_PATTERN.sub("", line))
            if re.search(r"[.!?]$", line):
                items.append(" ".join(current))
                current = []
        if current:
            items.append(" ".join(current))
        return self._unique([item.strip() for item in items if item.strip()])

    # ------------------------------------------------------------ entries

    @staticmethod
    def _is_short_header(text: str) -> bool:
        return len(text.split()) <= 6 and not re.search(r"[.,;:]$", text)

    def _group_entries(self, lines: list[str]) -> list[dict[str, list[str]]]:
        """Group lines into entries of header lines (title, organisation, dates, place) and description lines.

        Works with or without bullet glyphs: PDF text extraction often drops them,
        so short unpunctuated lines are treated as headers and longer or wrapped
        lines as description.
        """
        cleaned: list[tuple[str, bool]] = []
        pending_bullet = False
        for line in lines:
            if line.strip() in {"•", "-", "*", "▪", "●", "o"}:
                pending_bullet = True  # Some PDFs put the bullet glyph on its own line.
                continue
            is_bullet = bool(BULLET_PATTERN.match(line)) or pending_bullet
            pending_bullet = False
            text = BULLET_PATTERN.sub("", line).strip()
            if text:
                cleaned.append((text, is_bullet))

        entries: list[dict[str, list[str]]] = []
        current: dict[str, list[str]] | None = None
        for index, (text, is_bullet) in enumerate(cleaned):
            upcoming = [item[0] for item in cleaned[index + 1:index + 3]]
            short = self._is_short_header(text)
            if current is not None and current["bullets"] and not is_bullet and short:
                date_nearby = bool(DATE_PATTERN.search(text)) or any(DATE_PATTERN.search(line) for line in upcoming)
                if date_nearby or (upcoming and self._is_short_header(upcoming[0])):
                    current = None  # a new entry's header block begins
            if current is None:
                current = {"header": [], "bullets": []}
                entries.append(current)
            if is_bullet:
                current["bullets"].append(text)
            elif current["bullets"]:
                previous = current["bullets"][-1]
                starts_sentence = text[:1].isupper() and len(text.split()) > 6 and re.search(r"[.!?][)\]\"']?$", previous)
                if starts_sentence:
                    current["bullets"].append(text)
                else:
                    current["bullets"][-1] = f"{previous} {text}"  # wrapped line
            elif short or DATE_PATTERN.search(text) and len(text.split()) <= 8:
                current["header"].append(text)
            else:
                current["bullets"].append(text)
        return [entry for entry in entries if entry["header"] or entry["bullets"]]

    def _parse_entries(self, lines: list[str], kind: str, known_skills: list[str]) -> list[dict[str, Any]]:
        parsed: list[dict[str, Any]] = []
        for entry in self._group_entries(lines):
            header = self._merge_split_dates(entry["header"])
            bullets = entry["bullets"]
            dates = [line for line in header if DATE_PATTERN.search(line) and len(line.split()) <= 8]
            names = [line for line in header if line not in dates]
            # Lines like "Team Lead | AeroBrick | 2021 - 2022" carry several fields.
            if len(names) == 1 and re.search(r"\s[|–—]\s|\s-\s", names[0]):
                parts = [part.strip() for part in re.split(r"\s[|–—]\s|\s-\s", names[0]) if part.strip()]
                dates += [part for part in parts if DATE_PATTERN.search(part)]
                names = [part for part in parts if not DATE_PATTERN.search(part)]
            places = [line for line in names[1:] if re.fullmatch(r"[A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .]+", line)]
            names = [line for line in names if line not in places]
            title = names[0] if names else (bullets[0][:60] if bullets else kind.title())
            organisation = names[1] if len(names) > 1 else self._extract_company(" ".join(header))
            description = " ".join(bullets) if bullets else " ".join(names[2:])
            full_text = " ".join(header + bullets)
            technologies = self._technologies_in(full_text, known_skills)
            record: dict[str, Any] = {
                "description": description,
                "technologies": technologies,
                "highlights": bullets[:4],
                "dates": " · ".join(self._unique(dates)),
                "location": places[0] if places else "",
                "kind": kind,
                "raw_text": full_text,
            }
            if kind == "project":
                record["name"] = title
                if organisation:
                    record["context"] = organisation
            else:
                record["title"] = title
                record["company"] = organisation
            parsed.append(record)
        return parsed

    def _merge_split_dates(self, header: list[str]) -> list[str]:
        merged: list[str] = []
        for line in header:
            if merged and re.fullmatch(rf"{MONTHS}\.?", merged[-1], re.IGNORECASE) and YEAR_PATTERN.match(line.strip()):
                merged[-1] = f"{merged[-1]} {line}"
            else:
                merged.append(line)
        return merged

    def _technologies_in(self, text: str, known_skills: list[str]) -> list[str]:
        found: list[str] = []
        lowered = text.lower()
        for skill in known_skills:
            if len(skill) > 1 and re.search(rf"(?<![a-z0-9]){re.escape(skill.lower())}(?![a-z0-9])", lowered):
                found.append(skill)
        normalized = lowered.replace("c++", "cpp")
        for skill in SKILL_ORDER:
            if any(re.search(pattern, normalized) for pattern in SKILL_PATTERNS[skill]):
                found.append(skill)
        return self._unique(found)[:8]

    def _parse_education_section(self, lines: list[str]) -> list[dict[str, Any]]:
        """Each degree line starts an entry; nearby lines add institution, score, year and details."""
        entries: list[dict[str, Any]] = []
        current: dict[str, Any] | None = None
        institution_pattern = re.compile(r"(university|college|institute|school|academy|vidyalaya|\biit\b|\bnit\b)", re.IGNORECASE)
        for raw in lines:
            text = BULLET_PATTERN.sub("", raw).strip()
            if not text:
                continue
            is_degree = bool(DEGREE_PATTERN.search(text)) and not re.match(r"^(cgpa|gpa|percentage|expected)", text, re.IGNORECASE)
            if current is None or (is_degree and current["degree"]):
                current = {"institution": "", "degree": "", "year": "", "score": "", "details": [], "lines": []}
                entries.append(current)
            current["lines"].append(text)
            score = re.search(r"(cgpa|gpa|percentage|cpi|sgpa)\s*[:\-]?\s*([\d.]+\s*(/\s*[\d.]+)?%?)", text, re.IGNORECASE)
            if is_degree and not current["degree"]:
                current["degree"] = text
            elif institution_pattern.search(text) and not current["institution"]:
                current["institution"] = text
            elif score and not current["score"]:
                current["score"] = score.group(0)
            elif not re.fullmatch(r"[A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .]+", text):  # skip "City, State"
                if current["details"] and not re.search(r"[.!?]$", current["details"][-1]) and text[:1].islower():
                    current["details"][-1] = f"{current['details'][-1]} {text}"
                else:
                    current["details"].append(text)
            year = YEAR_PATTERN.search(text)
            if year and ("graduat" in text.lower() or not current["year"]):
                current["year"] = year.group(0)
        parsed = []
        for entry in entries:
            text = " ".join(entry.pop("lines"))
            entry["details"] = entry["details"][:4]
            entry["text"] = text
            parsed.append(entry)
        # Share one institution across degrees listed under it.
        institutions = [entry["institution"] for entry in parsed if entry["institution"]]
        for entry in parsed:
            if not entry["institution"] and len(institutions) == 1:
                entry["institution"] = institutions[0]
        return parsed

    def _extract_company(self, text: str) -> str:
        match = re.search(r"\b(at|for|@)\s+([A-Z][A-Za-z0-9&.\- ]{2,60})", text)
        return match.group(2).strip() if match else ""

    def _extract_year(self, text: str) -> str:
        matches = list(YEAR_PATTERN.finditer(text))
        return matches[-1].group(0) if matches else ""

    def _unique(self, items: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in items:
            cleaned = re.sub(r"\s+", " ", str(item)).strip()
            key = re.sub(r"[^a-z0-9+#]+", "", cleaned.lower())
            if cleaned and key and key not in seen:
                seen.add(key)
                result.append(cleaned)
        return result
