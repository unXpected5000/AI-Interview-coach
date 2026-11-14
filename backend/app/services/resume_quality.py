"""Measured resume-quality signals for the optimiser.

Scores here are computed from the resume itself so they are reproducible and
explainable. They are heuristics for coaching, not a prediction of how any
particular applicant-tracking system or recruiter will rate the resume.
"""
from __future__ import annotations

import re
from typing import Any

STRONG_VERBS = {
    "achieved", "analysed", "analyzed", "architected", "automated", "built", "calculated", "championed", "coordinated",
    "created", "delivered", "designed", "developed", "drafted", "engineered", "established", "evaluated", "executed",
    "expedited", "fabricated", "implemented", "improved", "increased", "initiated", "integrated", "investigated",
    "launched", "led", "maintained", "managed", "mentored", "migrated", "modelled", "modeled", "optimised", "optimized",
    "organised", "organized", "performed", "presented", "programmed", "prototyped", "published", "reduced", "redesigned",
    "researched", "resolved", "simulated", "spearheaded", "streamlined", "tested", "trained", "validated", "wrote",
    "brainstormed", "collaborated", "compared", "conducted", "configured", "deployed", "documented", "drove", "secured",
    "served", "sterilized", "promoted", "procured", "tabulated", "assembled", "installed", "surveyed", "estimated",
    # Irregular past tenses (the "-ed" rule below cannot recognise these).
    "ran", "taught", "made", "oversaw", "won", "set", "sought", "found", "built", "led", "drew", "devised",
}
def _base_forms(verbs: set[str]) -> set[str]:
    """Present-tense forms ("design", "expedite", "lead"); current roles use present tense."""
    forms = set()
    for verb in verbs:
        if verb.endswith("ied"):
            forms.add(verb[:-3] + "y")
        elif verb.endswith("ed"):
            forms.update({verb[:-2], verb[:-1]})
            if len(verb) > 4 and verb[-3] == verb[-4]:
                forms.add(verb[:-3])  # "planned" -> "plan"
    return forms | {"lead", "build", "write", "drive", "run", "teach", "make", "oversee", "present"}


BASE_VERBS = _base_forms(STRONG_VERBS)
WEAK_OPENERS = ("responsible for", "worked on", "helped", "assisted", "involved in", "duties included", "tasked with", "part of")
METRIC_PATTERN = re.compile(r"(\d+(\.\d+)?\s*(%|percent|x\b|k\b|lakh|crore|hours?|days?|weeks?|months?|users?|members?|people|students?|kg|mm|°)|\$\s?\d|₹\s?\d|\b\d{2,}\b)", re.I)

# Keywords recruiters commonly expect for typical roles in each department.
DEPARTMENT_ROLE_KEYWORDS = {
    "ai and ds": ["python", "sql", "machine learning", "pandas", "numpy", "statistics", "data visualization", "scikit-learn", "deep learning", "git"],
    "comps": ["data structures & algorithms", "java", "python", "c++", "sql", "git", "rest apis", "react", "linux", "software testing"],
    "it": ["sql", "java", "python", "computer networks", "linux", "git", "rest apis", "html/css", "javascript", "cybersecurity"],
    "mechatronics": ["plc", "robotics", "control systems", "embedded systems", "arduino", "matlab", "solidworks", "sensors", "c", "simulink"],
    "elx": ["embedded systems", "microcontrollers", "pcb design", "circuit design", "c", "matlab", "vlsi", "verilog", "signal processing", "arduino"],
    "extc": ["communication systems", "signal processing", "matlab", "embedded systems", "microcontrollers", "computer networks", "rf", "iot", "c", "python"],
    "mech": ["solidworks", "autocad", "catia", "ansys", "gd&t", "manufacturing processes", "thermodynamics", "fea", "matlab", "cnc machining"],
    "civil": ["autocad", "staad.pro", "etabs", "revit", "estimation & costing", "surveying", "structural analysis", "construction management", "ms project", "primavera"],
}
ROLE_KEYWORDS = {
    "frontend": ["react", "javascript", "typescript", "html/css", "tailwind css", "git"],
    "backend": ["python", "rest apis", "sql", "mongodb", "docker", "git"],
    "full stack": ["react", "javascript", "rest apis", "sql", "node.js", "git"],
    "data": ["python", "sql", "pandas", "statistics", "data visualization", "excel"],
    "machine learning": ["python", "machine learning", "deep learning", "pytorch", "tensorflow", "scikit-learn"],
    "devops": ["docker", "kubernetes", "aws", "linux", "git"],
    "design engineer": ["solidworks", "autocad", "gd&t", "fea", "ansys", "manufacturing processes"],
    "site engineer": ["autocad", "surveying", "estimation & costing", "construction management"],
    "structural": ["staad.pro", "etabs", "structural analysis", "autocad"],
    "embedded": ["embedded systems", "c", "microcontrollers", "pcb design", "arduino"],
    "automation": ["plc", "scada", "control systems", "robotics"],
    "network": ["computer networks", "linux", "cybersecurity"],
}


def resume_bullets(structured: dict[str, Any]) -> list[dict[str, str]]:
    bullets: list[dict[str, str]] = []
    for section in ("experience", "internships", "projects"):
        for entry in structured.get(section, []) or []:
            label = entry.get("name") or entry.get("title") or section.title()
            for highlight in entry.get("highlights", []) or []:
                text = re.sub(r"\s+", " ", str(highlight)).strip()
                if len(text.split()) >= 4:
                    bullets.append({"section": section, "entry": str(label), "text": text})
    return bullets


def analyse_bullet(text: str) -> dict[str, Any]:
    words = text.split()
    first = re.sub(r"[^a-z]", "", words[0].lower()) if words else ""
    lowered = text.lower()
    issues: list[str] = []
    third_person = first[:-1] if first.endswith("s") else first
    strong_verb = first in STRONG_VERBS or first in BASE_VERBS or third_person in BASE_VERBS or (first.endswith("ed") and len(first) > 4)
    if any(lowered.startswith(opener) for opener in WEAK_OPENERS):
        issues.append("starts with a passive phrase")
        strong_verb = False
    elif not strong_verb:
        issues.append("doesn't start with an action verb")
    has_metric = bool(METRIC_PATTERN.search(text))
    if not has_metric:
        issues.append("no measurable result")
    if len(words) > 35:
        issues.append("too long to scan quickly")
    elif len(words) < 7:
        issues.append("too short to show impact")
    return {"strong_verb": strong_verb, "has_metric": has_metric, "issues": issues}


def suggest_bullet(text: str, analysis: dict[str, Any]) -> str:
    """A rewrite template that never invents facts: unknown numbers become [placeholders]."""
    cleaned = text.rstrip(".")
    lowered = cleaned.lower()
    for opener in WEAK_OPENERS:
        if lowered.startswith(opener):
            cleaned = cleaned[len(opener):].strip(" :,-")
            cleaned = f"Delivered {cleaned[0].lower() + cleaned[1:]}" if cleaned else "Delivered [what you did]"
            break
    else:
        if not analysis["strong_verb"]:
            cleaned = f"Delivered {cleaned[0].lower() + cleaned[1:]}"
    if not analysis["has_metric"]:
        cleaned += ", resulting in [measurable outcome, e.g. % improvement, time saved, or scale]"
    return cleaned + "."


def _score(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 1)


def compute_breakdown(structured: dict[str, Any], skills: list[str], keyword_coverage: float, has_contact: bool) -> dict[str, Any]:
    bullets = resume_bullets(structured)
    analyses = [analyse_bullet(bullet["text"]) for bullet in bullets]
    total = len(analyses)
    verb_ratio = sum(item["strong_verb"] for item in analyses) / total if total else 0.0
    metric_ratio = sum(item["has_metric"] for item in analyses) / total if total else 0.0
    projects = structured.get("projects", []) or []
    roles = (structured.get("experience", []) or []) + (structured.get("internships", []) or [])
    technical_skills = [skill for skill in skills if skill.lower() not in {"excel", "microsoft office", "google workspace"}]

    project_bullets = [item for item, bullet in zip(analyses, bullets) if bullet["section"] == "projects"]
    project_score = (
        min(1.0, len(projects) / 2) * 40
        + (sum(len(project.get("technologies", []) or []) > 0 for project in projects) / len(projects) * 25 if projects else 0)
        + (sum(item["has_metric"] for item in project_bullets) / len(project_bullets) * 35 if project_bullets else 0)
    )
    role_score = min(1.0, len(roles) / 2) * 45 + (sum(bool(role.get("dates")) for role in roles) / len(roles) * 15 if roles else 0) + (
        min(1.0, sum(len(role.get("highlights", []) or []) for role in roles) / 6) * 40
    )
    sections_present = sum(bool(structured.get(key)) for key in ("education", "skills", "projects", "experience")) + bool(structured.get("internships"))
    structure_score = min(4, sections_present) / 4 * 60 + (20 if has_contact else 0) + (20 if 6 <= total <= 24 else 10 if total else 0)

    def recs(*items: tuple[bool, str]) -> list[str]:
        return [text for condition, text in items if condition] or ["This area looks solid; keep it specific and up to date."]

    return {
        "ats_score": {
            "score": _score(70 * keyword_coverage + 30 * (min(4, sections_present) / 4)),
            "recommendations": recs(
                (keyword_coverage < 0.6, "Add the target role's key skills where you genuinely have them, in the skills list and in bullets."),
                (sections_present < 4, "Use standard section headings (Education, Experience, Projects, Skills) so parsers find them."),
            ),
        },
        "project_quality": {
            "score": _score(project_score),
            "recommendations": recs(
                (len(projects) < 2, "Add one or two projects relevant to the role, with your role and the tools you used."),
                (bool(project_bullets) and not any(item["has_metric"] for item in project_bullets), "State a result for each project (accuracy, speed, cost, users, marks or award)."),
                (bool(projects) and not all(project.get("technologies") for project in projects), "Name the tools or technologies used in every project."),
            ),
        },
        "technical_depth": {
            "score": _score(min(1.0, len(technical_skills) / 8) * 60 + (sum(bool(entry.get("technologies")) for entry in projects + roles) / max(1, len(projects + roles))) * 40),
            "recommendations": recs(
                (len(technical_skills) < 6, "List the specific technical tools and methods you can discuss confidently in an interview."),
                (not any(entry.get("technologies") for entry in projects + roles), "Show skills in context: mention the tool inside the bullet where you used it."),
            ),
        },
        "experience_strength": {
            "score": _score(role_score),
            "recommendations": recs(
                (not roles, "Add internships, research, competitions or team roles; student experience counts."),
                (bool(roles) and not all(role.get("dates") for role in roles), "Include start and end dates for every role."),
            ),
        },
        "impact_statements": {
            "score": _score((verb_ratio * 50 + metric_ratio * 50) if total else 0),
            "recommendations": recs(
                (total == 0, "Write 2-4 bullet points under each role and project."),
                (bool(total) and verb_ratio < 0.8, "Start every bullet with a strong action verb (Designed, Led, Built, Reduced)."),
                (bool(total) and metric_ratio < 0.5, "Quantify results where you can: numbers make impact concrete."),
            ),
        },
        "resume_structure": {
            "score": _score(structure_score),
            "recommendations": recs(
                (not has_contact, "Put your email and phone number at the top."),
                (total > 24, "Trim to the most relevant bullets; aim for one page as a student."),
                (sections_present < 4, "Make sure Education, Skills, Projects and Experience sections are all present."),
            ),
        },
    }


def bullet_improvements(structured: dict[str, Any], limit: int = 6) -> list[dict[str, Any]]:
    improvements = []
    for bullet in resume_bullets(structured):
        analysis = analyse_bullet(bullet["text"])
        if analysis["issues"]:
            improvements.append({
                "section": bullet["section"],
                "entry": bullet["entry"],
                "original": bullet["text"],
                "issues": analysis["issues"],
                "suggestion": suggest_bullet(bullet["text"], analysis),
            })
    # Show the bullets with the most issues first.
    return sorted(improvements, key=lambda item: -len(item["issues"]))[:limit]


def target_keywords_for(target_role: str, department: str | None) -> list[str]:
    lowered = target_role.lower()
    keywords: list[str] = []
    for key, values in ROLE_KEYWORDS.items():
        if key in lowered:
            keywords.extend(values)
    if not keywords and department:
        keywords.extend(DEPARTMENT_ROLE_KEYWORDS.get(department.strip().lower(), []))
    return keywords
