from __future__ import annotations

import json
import re
from typing import Any

from app.ai.llm_client import LLMClient, LLMClientError
from app.ai.prompts import QUESTION_GENERATION_PROMPT
from app.utils.mongo import make_json_safe


QUESTION_TYPES = ("conceptual", "practical", "scenario")
QUESTION_DIFFICULTIES = {"low", "medium", "hard", "interview_ready", "easy"}
QUESTION_TYPE_SEQUENCE = [
    "conceptual",
    "practical",
    "scenario",
    "conceptual",
    "practical",
    "scenario",
    "conceptual",
    "practical",
    "scenario",
    "practical",
]


class QuestionService:
    def __init__(self, llm_client: LLMClient):
        self.llm_client = llm_client

    async def generate_questions(self, resume: dict[str, Any], interview_context: dict[str, Any] | None = None) -> list[dict]:
        structured_resume = resume.get("structured_resume") or {}
        skills = self._unique_strings(
            list(resume.get("extracted_skills", []))
            + list(structured_resume.get("skills", []))
            + list(structured_resume.get("tools", []))
        )
        topic_plan = self._build_topic_plan(structured_resume, skills, (interview_context or {}).get("difficulty", "medium"))
        prompt = self._build_prompt(structured_resume, skills, topic_plan, interview_context)

        try:
            response_text = await self.llm_client.generate(prompt)
            parsed = self.llm_client.parse_json(response_text)
            if not isinstance(parsed, dict):
                raise ValueError("Question response must be a JSON object.")
            questions = self._validate_questions(parsed.get("questions", []), topic_plan)
            if questions:
                return questions
        except (LLMClientError, ValueError, json.JSONDecodeError):
            pass

        return self._build_fallback_questions(topic_plan)

    @staticmethod
    def difficulty_for_score(score: float) -> str:
        if score < 50:
            return "easy"
        if score >= 80:
            return "hard"
        return "medium"

    async def adapt_question(
        self,
        question: dict[str, Any],
        answer_text: str,
        score: float,
        target_difficulty: str | None = None,
    ) -> dict[str, Any]:
        """Rewrite the next question at a level selected from the last answer."""
        requested_difficulty = target_difficulty or self.difficulty_for_score(score)
        difficulty = "easy" if requested_difficulty == "low" else requested_difficulty
        prompt = (
            "Rewrite the next interview question for the requested difficulty, using the candidate's prior answer "
            "to choose a useful level of challenge. Return one strict JSON object with keys question, expected_answer, "
            "expected_points (array of strings), and question_type. Keep the original topic and assess the requested "
            "difficulty. Do not answer the question.\n\n"
            + json.dumps(
                {
                    "difficulty": difficulty,
                    "next_question": question,
                    "previous_answer": answer_text[:3000],
                },
                ensure_ascii=False,
            )
        )
        try:
            parsed = self.llm_client.parse_json(await self.llm_client.generate(prompt))
            if not isinstance(parsed, dict):
                raise ValueError("Adaptive question response must be a JSON object.")
            text = str(parsed.get("question", "")).strip()
            expected = str(parsed.get("expected_answer", "")).strip()
            points = self._normalize_list(parsed.get("expected_points", []))
            if not text or not expected or not points:
                raise ValueError("Adaptive question response was incomplete.")
        except (LLMClientError, ValueError, json.JSONDecodeError):
            text, expected, points = self._adaptive_fallback(question, difficulty)

        adapted = dict(question)
        adapted.update(
            {
                "difficulty": requested_difficulty,
                "question": text,
                "expected_answer": expected,
                "expected_points": points,
                "key_points": points,
            }
        )
        return adapted

    async def generate_follow_up(
        self,
        question: dict[str, Any],
        answer_text: str,
        evaluation: dict[str, Any],
        question_id: int,
        target_difficulty: str | None = None,
    ) -> dict[str, Any]:
        score = float(evaluation.get("score", 0))
        requested_difficulty = target_difficulty or ("easy" if score < 50 else "hard")
        difficulty = "easy" if requested_difficulty == "low" else requested_difficulty
        prompt = (
            "Create one concise, specific follow-up interview question based on the prior question and answer. "
            "For an easy follow-up, clarify a missing fundamental. For a hard follow-up, probe a trade-off, edge case, "
            "or deeper reasoning. Return strict JSON with question, expected_answer, and expected_points (array of strings). "
            "Do not repeat the original question.\n\n"
            + json.dumps(
                {
                    "difficulty": difficulty,
                    "question": question.get("question", ""),
                    "topic": question.get("topic_focus", question.get("skill", "the topic")),
                    "answer": answer_text[:3000],
                    "missing_points": evaluation.get("missing_points", []),
                },
                ensure_ascii=False,
            )
        )
        try:
            parsed = self.llm_client.parse_json(await self.llm_client.generate(prompt))
            if not isinstance(parsed, dict):
                raise ValueError("Follow-up response must be a JSON object.")
            text = str(parsed.get("question", "")).strip()
            expected = str(parsed.get("expected_answer", "")).strip()
            points = self._normalize_list(parsed.get("expected_points", []))
            if not text or not expected or not points:
                raise ValueError("Follow-up response was incomplete.")
        except (LLMClientError, ValueError, json.JSONDecodeError):
            text, expected, points = self._follow_up_fallback(question, evaluation, difficulty)

        return {
            "question_id": question_id,
            "skill": question.get("skill", "General"),
            "difficulty": requested_difficulty,
            "question_type": "scenario" if difficulty == "hard" else "conceptual",
            "topic_focus": question.get("topic_focus", question.get("skill", "General")),
            "source_section": question.get("source_section", "skills"),
            "question": text,
            "expected_answer": expected,
            "expected_points": points,
            "key_points": points,
            "follow_up_for": question["question_id"],
        }

    def _adaptive_fallback(self, question: dict[str, Any], difficulty: str) -> tuple[str, str, list[str]]:
        topic = question.get("topic_focus", question.get("skill", "this topic"))
        existing = str(question.get("question", "Explain this topic."))
        points = self._normalize_list(question.get("expected_points", question.get("key_points", [])))
        if difficulty == "easy":
            text = f"Could you explain the main idea behind {topic} step by step?"
        elif difficulty == "hard":
            text = f"What trade-offs and edge cases would you consider when applying {topic}?"
        else:
            text = existing
        expected = str(question.get("expected_answer", "Explain the approach, reasoning, and outcome."))
        return text, expected, points or [f"Explain the core ideas behind {topic}"]

    def _follow_up_fallback(
        self,
        question: dict[str, Any],
        evaluation: dict[str, Any],
        difficulty: str,
    ) -> tuple[str, str, list[str]]:
        topic = question.get("topic_focus", question.get("skill", "this topic"))
        points = self._normalize_list(evaluation.get("missing_points", []))
        if difficulty == "easy":
            focus = points[0] if points else f"your use of {topic}"
            text = f"Could you clarify {focus} with a simple example?"
            expected_points = points or [f"Give a clear example related to {topic}"]
        else:
            text = f"What trade-off or edge case could change your approach to {topic}?"
            expected_points = self._normalize_list(question.get("expected_points", [])) or [
                f"Discuss a trade-off or edge case for {topic}"
            ]
        expected = "Address the follow-up directly and support the response with a relevant example or rationale."
        return text, expected, expected_points

    def _build_prompt(self, structured_resume: dict[str, Any], skills: list[str], topic_plan: list[dict], interview_context: dict[str, Any] | None) -> str:
        resume_context = {
            "education": structured_resume.get("education", []),
            "projects": structured_resume.get("projects", []),
            "internships": structured_resume.get("internships", []),
            "experience": structured_resume.get("experience", []),
            "skills": structured_resume.get("skills", []),
            "certifications": structured_resume.get("certifications", []),
            "tools": structured_resume.get("tools", []),
            "summary_lines": structured_resume.get("summary_lines", []),
        }
        payload = {
            "skills": skills,
            "topic_plan": topic_plan,
            "resume_context": resume_context,
            "interview_context": interview_context or {},
        }
        return f"{QUESTION_GENERATION_PROMPT}\n\nResume context:\n{json.dumps(make_json_safe(payload), indent=2)}"

    def _build_topic_plan(self, structured_resume: dict[str, Any], skills: list[str], difficulty: str = "medium") -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []

        for project in structured_resume.get("projects", []):
            topic = self._topic_label(project.get("name"), project.get("description"), "Project")
            candidates.append(
                {
                    "topic_focus": topic,
                    "source_section": "projects",
                    "skill": self._first_non_empty(project.get("technologies", []) or skills, default="Project delivery"),
                    "context": project.get("description", ""),
                    "technologies": project.get("technologies", []),
                    "highlights": project.get("highlights", []),
                }
            )

        for internship in structured_resume.get("internships", []):
            topic = self._topic_label(internship.get("title"), internship.get("company"), "Internship")
            candidates.append(
                {
                    "topic_focus": topic,
                    "source_section": "internships",
                    "skill": self._first_non_empty(internship.get("technologies", []) or skills, default="Experience"),
                    "context": internship.get("description", ""),
                    "technologies": internship.get("technologies", []),
                    "highlights": internship.get("highlights", []),
                }
            )

        for experience in structured_resume.get("experience", []):
            topic = self._topic_label(experience.get("title"), experience.get("company"), "Experience")
            candidates.append(
                {
                    "topic_focus": topic,
                    "source_section": "experience",
                    "skill": self._first_non_empty(experience.get("technologies", []) or skills, default="Delivery"),
                    "context": experience.get("description", ""),
                    "technologies": experience.get("technologies", []),
                    "highlights": experience.get("highlights", []),
                }
            )

        for skill in structured_resume.get("skills", []):
            candidates.append(
                {
                    "topic_focus": skill,
                    "source_section": "skills",
                    "skill": skill,
                    "context": f"Skill claimed in the resume: {skill}",
                    "technologies": [],
                    "highlights": [],
                }
            )

        for tool in structured_resume.get("tools", []):
            candidates.append(
                {
                    "topic_focus": tool,
                    "source_section": "tools",
                    "skill": tool,
                    "context": f"Tool or platform mentioned in the resume: {tool}",
                    "technologies": [],
                    "highlights": [],
                }
            )

        for certification in structured_resume.get("certifications", []):
            candidates.append(
                {
                    "topic_focus": certification,
                    "source_section": "certifications",
                    "skill": certification,
                    "context": certification,
                    "technologies": [],
                    "highlights": [],
                }
            )

        for education in structured_resume.get("education", []):
            topic = education.get("degree") or education.get("institution") or education.get("text") or "Education"
            candidates.append(
                {
                    "topic_focus": topic,
                    "source_section": "education",
                    "skill": topic,
                    "context": education.get("text", ""),
                    "technologies": [],
                    "highlights": [],
                }
            )

        if not candidates:
            candidates = [
                {
                    "topic_focus": skill,
                    "source_section": "skills",
                    "skill": skill,
                    "context": skill,
                    "technologies": [],
                    "highlights": [],
                }
                for skill in (skills or ["Python", "REST APIs", "MongoDB", "React"])
            ]

        candidates = self._expand_candidates(candidates, skills)

        plan: list[dict[str, Any]] = []
        used_topics: set[str] = set()
        for index in range(10):
            question_difficulty = difficulty if difficulty in QUESTION_DIFFICULTIES else "medium"
            if question_difficulty == "interview_ready":
                question_difficulty = ("medium", "medium", "medium", "low", "medium", "hard", "medium", "low", "hard", "medium")[index]
            candidate = self._next_candidate(candidates, used_topics, index)
            question_type = QUESTION_TYPE_SEQUENCE[index]
            plan.append(
                {
                    "question_id": index + 1,
                    "difficulty": question_difficulty,
                    "question_type": question_type,
                    "topic_focus": candidate["topic_focus"],
                    "source_section": candidate["source_section"],
                    "skill": candidate["skill"],
                    "context": candidate.get("context", ""),
                    "technologies": candidate.get("technologies", []),
                    "highlights": candidate.get("highlights", []),
                }
            )

        return plan

    def _expand_candidates(self, candidates: list[dict[str, Any]], skills: list[str]) -> list[dict[str, Any]]:
        unique: list[dict[str, Any]] = []
        seen: set[str] = set()
        for candidate in candidates:
            key = self._normalize_key(candidate["topic_focus"])
            if key and key not in seen:
                seen.add(key)
                unique.append(candidate)

        source_skills = skills or ["Python", "REST APIs", "MongoDB", "React", "Testing"]
        expansion_templates = [
            ("fundamentals", "Explain the fundamentals of {topic}."),
            ("implementation", "How would you implement {topic} in a real project?"),
            ("tradeoffs", "What tradeoffs matter when using {topic}?"),
            ("scaling", "How would you scale or harden {topic}?"),
            ("debugging", "How would you debug issues around {topic}?"),
        ]

        for skill in source_skills:
            for suffix, context in expansion_templates:
                if len(unique) >= 10:
                    break
                topic_focus = f"{skill} {suffix}"
                key = self._normalize_key(topic_focus)
                if key in seen:
                    continue
                seen.add(key)
                unique.append(
                    {
                        "topic_focus": topic_focus,
                        "source_section": "skills",
                        "skill": skill,
                        "context": context.format(topic=skill),
                        "technologies": [],
                        "highlights": [],
                    }
                )
            if len(unique) >= 10:
                break

        while len(unique) < 10:
            topic_focus = f"resume detail {len(unique) + 1}"
            unique.append(
                {
                    "topic_focus": topic_focus,
                    "source_section": "skills",
                    "skill": "General",
                    "context": topic_focus,
                    "technologies": [],
                    "highlights": [],
                }
            )

        return unique

    def _next_candidate(self, candidates: list[dict[str, Any]], used_topics: set[str], index: int) -> dict[str, Any]:
        for offset in range(len(candidates)):
            candidate = candidates[(index + offset) % len(candidates)]
            key = self._normalize_key(candidate["topic_focus"])
            if key not in used_topics:
                used_topics.add(key)
                return candidate

        candidate = candidates[index % len(candidates)]
        used_topics.add(self._normalize_key(candidate["topic_focus"]))
        return candidate

    def _validate_questions(self, questions: list[dict], topic_plan: list[dict]) -> list[dict]:
        if len(questions) != 10:
            return []

        normalized_topics: set[str] = set()
        normalized_questions: list[dict] = []

        for index, question in enumerate(questions, start=1):
            plan_item = topic_plan[index - 1] if index - 1 < len(topic_plan) else {}
            # Start from a consistent middle level; later questions are adapted from
            # the candidate's server-calculated answer scores.
            difficulty = str(plan_item.get("difficulty", "medium")).lower().strip()
            question_type = str(question.get("question_type", plan_item.get("question_type", "conceptual"))).lower().strip()
            topic_focus = str(question.get("topic_focus", plan_item.get("topic_focus", ""))).strip()
            if difficulty not in QUESTION_DIFFICULTIES or question_type not in QUESTION_TYPES or not topic_focus:
                return []
            if self._normalize_key(topic_focus) in normalized_topics:
                return []

            expected_points = self._normalize_list(question.get("expected_points", question.get("key_points", [])))
            if not expected_points:
                return []

            normalized_topics.add(self._normalize_key(topic_focus))
            normalized_questions.append(
                {
                    "question_id": index,
                    "skill": str(question.get("skill", plan_item.get("skill", "General"))).strip() or "General",
                    "difficulty": difficulty,
                    "question_type": question_type,
                    "topic_focus": topic_focus,
                    "source_section": str(question.get("source_section", plan_item.get("source_section", "skills"))).strip()
                    or "skills",
                    "question": str(question.get("question", "")).strip(),
                    "expected_answer": str(question.get("expected_answer", "")).strip(),
                    "expected_points": expected_points,
                    "key_points": expected_points,
                }
            )

        return normalized_questions

    def _build_fallback_questions(self, topic_plan: list[dict]) -> list[dict]:
        questions: list[dict] = []

        for index, plan_item in enumerate(topic_plan, start=1):
            question, expected_answer, expected_points = self._build_question_components(plan_item)
            questions.append(
                {
                    "question_id": index,
                    "skill": plan_item["skill"],
                    "difficulty": plan_item["difficulty"],
                    "question_type": plan_item["question_type"],
                    "topic_focus": plan_item["topic_focus"],
                    "source_section": plan_item["source_section"],
                    "question": question,
                    "expected_answer": expected_answer,
                    "expected_points": expected_points,
                    "key_points": expected_points,
                }
            )

        return questions

    def _build_question_components(self, plan_item: dict[str, Any]) -> tuple[str, str, list[str]]:
        topic = plan_item["topic_focus"]
        context = self._clean_text(plan_item.get("context", ""))
        technologies = self._unique_strings(plan_item.get("technologies", []))
        highlights = self._unique_strings(plan_item.get("highlights", []))
        question_type = plan_item["question_type"]
        difficulty = plan_item["difficulty"]
        source_section = plan_item["source_section"]

        if source_section == "projects":
            if question_type == "practical":
                question = f"I'd love to hear about your work on {topic}. Could you walk me through the technical choices you made?"
                expected_answer = f"Explain the project goals, implementation steps, and why the chosen stack fit {topic}."
                expected_points = [
                    f"project goal behind {topic}",
                    "implementation approach",
                    "technology choices and tradeoffs",
                    "result or learning from the project",
                ]
            elif question_type == "scenario":
                question = f"Imagine we needed to scale {topic} for a larger user base. What would be your first steps?"
                expected_answer = f"Discuss scaling concerns, data flow, bottlenecks, and how to adapt the project responsibly."
                expected_points = [
                    "identify bottlenecks",
                    "data flow or architecture changes",
                    "testing or monitoring approach",
                    "tradeoff reasoning",
                ]
            else:
                question = f"Can you give me a high-level overview of {topic} and the main problem it aimed to solve?"
                expected_answer = f"Describe the business or technical problem, the solution, and the main technologies used."
                expected_points = [
                    "problem statement",
                    "solution summary",
                    "technologies used",
                    "outcome or impact",
                ]
        elif source_section in {"internships", "experience"}:
            if question_type == "scenario":
                question = f"How would you approach handling a production issue that impacted your work on {topic}?"
                expected_answer = f"Talk through debugging, stakeholder communication, root cause analysis, and mitigation."
                expected_points = [
                    "debugging steps",
                    "communication with team or stakeholders",
                    "root cause analysis",
                    "mitigation or follow-up",
                ]
            elif question_type == "practical":
                question = f"Can you walk me through what you personally built or improved for {topic}?"
                expected_answer = f"Explain responsibilities, implementation details, and validation or testing used in the role."
                expected_points = [
                    "your contribution",
                    "implementation detail",
                    "testing or validation",
                    "measurable result or learning",
                ]
            else:
                question = f"What was the most valuable lesson you took away from your experience with {topic}?"
                expected_answer = f"Summarize the lesson, how it changed your approach, and how it applies to future work."
                expected_points = [
                    "lesson learned",
                    "how it changed your approach",
                    "future application",
                ]
        elif source_section == "education":
            question = f"How has your educational background prepared you for practical work on {topic}?"
            expected_answer = "Connect coursework, foundations, and practical readiness to the role."
            expected_points = [
                "relevant coursework or foundation",
                "link to practical work",
                "confidence with core concepts",
            ]
        else:
            if question_type == "scenario":
                question = f"If you were using {topic} in a brand-new project, what edge cases would you watch out for?"
                expected_answer = f"Describe a real implementation approach for {topic} and mention reliability or edge cases."
                expected_points = [
                    "real use case",
                    "implementation approach",
                    "edge cases or tradeoffs",
                ]
            elif question_type == "practical":
                question = f"Could you share an example of how you've applied {topic} in a hands-on capacity?"
                expected_answer = f"Explain where {topic} fits, how it was used, and the value it added."
                expected_points = [
                    "where it was used",
                    "how it was applied",
                    "value or benefit",
                ]
            else:
                question = f"For someone less familiar, how would you describe the core concept behind {topic}?"
                expected_answer = f"Define {topic} in plain language and explain why it matters in practice."
                expected_points = [
                    "clear definition",
                    "practical relevance",
                    "simple explanation",
                ]

        if difficulty == "hard":
            expected_points.append("deeper tradeoff or design insight")
            question = self._upgrade_for_hardness(question, topic)
            expected_answer = self._upgrade_for_hardness(expected_answer, topic)
        elif difficulty == "medium":
            expected_points.append("some implementation detail")

        if technologies:
            expected_points.append(f"reference to {technologies[0]}")
        if highlights:
            expected_points.append(highlights[0])

        expected_points = self._unique_strings(expected_points)
        return question, expected_answer, expected_points[:5]

    def _upgrade_for_hardness(self, text: str, topic: str) -> str:
        if "design" not in text.lower():
            return f"{text} Include design tradeoffs and explain how you would handle {topic} at larger scale."
        return text

    def _normalize_list(self, items: list[Any]) -> list[str]:
        return self._unique_strings([str(item).strip() for item in items if str(item).strip()])

    def _unique_strings(self, items: list[Any]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in items:
            cleaned = self._clean_text(str(item))
            if not cleaned:
                continue
            key = self._normalize_key(cleaned)
            if key not in seen:
                seen.add(key)
                result.append(cleaned)
        return result

    def _first_non_empty(self, items: list[str], default: str = "") -> str:
        for item in items:
            cleaned = self._clean_text(item)
            if cleaned:
                return cleaned
        return default

    def _topic_label(self, primary: Any, secondary: Any, fallback: str) -> str:
        for candidate in (primary, secondary):
            cleaned = self._clean_text(str(candidate))
            if cleaned:
                return cleaned
        return fallback

    def _clean_text(self, value: str) -> str:
        cleaned = re.sub(r"\s+", " ", value).strip()
        return cleaned

    def _normalize_key(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", value.lower())
