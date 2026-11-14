from __future__ import annotations

import hashlib
import json
import random
import re
from datetime import datetime, timezone
from typing import Any

from app.ai.llm_client import LLMClient, LLMClientError
from app.ai.prompts import QUESTION_GENERATION_PROMPT
from app.utils.mongo import make_json_safe

QUESTION_TYPES = ("introduction", "conceptual", "practical", "scenario", "behavioral", "closing")
# Types scored with the communication/STAR rubric instead of technical depth.
CONVERSATIONAL_TYPES = {"introduction", "behavioral", "situational", "closing"}
QUESTION_DIFFICULTIES = {"low", "medium", "hard", "interview_ready", "easy"}

# The shape of a real interview: open, go deep on real work, test skills,
# problem-solve, check teamwork and resilience, then close.
INTERVIEW_ARC: list[dict[str, str]] = [
    {"slot": "introduction", "question_type": "introduction"},
    {"slot": "deep_dive", "question_type": "practical"},
    {"slot": "decision", "question_type": "practical"},
    {"slot": "second_experience", "question_type": "practical"},
    {"slot": "skill_applied", "question_type": "practical"},
    {"slot": "scenario", "question_type": "scenario"},
    {"slot": "skill_depth", "question_type": "conceptual"},
    {"slot": "teamwork", "question_type": "behavioral"},
    {"slot": "setback", "question_type": "behavioral"},
    {"slot": "closing", "question_type": "closing"},
]

DEPARTMENT_FIELDS = {
    "ai and ds": "AI and data science",
    "comps": "computer engineering",
    "it": "information technology",
    "mechatronics": "mechatronics",
    "elx": "electronics",
    "extc": "electronics and telecommunication",
    "mech": "mechanical engineering",
    "civil": "civil engineering",
}

# Realistic, open-ended problems an interviewer in each field might pose.
DEPARTMENT_SCENARIOS = {
    "ai and ds": [
        ("A model you trained looks great in testing, but accuracy drops a lot once it's used on real data. How would you figure out what's going on?",
         ["check for data drift or distribution shift", "compare training and production data", "look for leakage or overfitting", "monitoring and retraining plan"]),
        ("You're given a messy dataset with missing values and duplicates a day before a deadline. How do you decide what to clean and what to leave?",
         ["prioritise issues by impact", "handling missing values", "deduplication approach", "communicating trade-offs"]),
    ],
    "comps": [
        ("Something you shipped is suddenly slow for some users but fine for others. How would you track down the cause?",
         ["reproduce and narrow the scope", "logs, metrics or profiling", "form and test hypotheses", "fix and prevent regression"]),
        ("You join a project with a large codebase and no documentation. How do you get productive quickly?",
         ["read code paths that matter", "run and debug locally", "ask focused questions", "document as you learn"]),
    ],
    "it": [
        ("A web application your team runs goes down during peak hours. Walk me through what you'd do in the first thirty minutes.",
         ["triage and communicate", "check monitoring and recent changes", "restore service first", "root cause and follow-up"]),
        ("A user reports they can see data that isn't theirs. How would you respond?",
         ["treat it as a security incident", "contain access", "investigate the access control bug", "notify and fix"]),
    ],
    "mechatronics": [
        ("A robotic arm prototype keeps overshooting its target position. How would you diagnose and fix it?",
         ["check sensors and feedback", "tune the controller", "mechanical play or backlash", "test methodically"]),
        ("Your sensor readings are noisy and the control loop is unstable. What would you look at first?",
         ["signal filtering", "sampling rate and timing", "grounding and wiring", "controller gains"]),
    ],
    "elx": [
        ("A circuit works on the bench but fails intermittently once it's installed. How would you troubleshoot it?",
         ["reproduce conditions", "power supply and noise", "connections and temperature", "measure with proper instruments"]),
        ("You need to cut the power consumption of a battery-powered device in half. Where would you start?",
         ["measure where power goes", "sleep modes", "component choices", "duty cycling"]),
    ],
    "extc": [
        ("Users in one area report poor signal and dropped connections. How would you approach diagnosing it?",
         ["gather data on location and time", "check interference and coverage", "antenna and link budget", "propose and verify a fix"]),
        ("A communication link has a higher error rate than expected. How would you find the cause?",
         ["measure signal to noise ratio", "check modulation and coding", "interference sources", "test changes"]),
    ],
    "mech": [
        ("A part you designed is failing earlier than expected during testing. How would you investigate?",
         ["inspect the failure mode", "revisit loads and assumptions", "material and manufacturing checks", "analysis or simulation and redesign"]),
        ("You're asked to reduce the cost of a component without hurting its performance. How do you approach it?",
         ["understand functional requirements", "material and process alternatives", "design for manufacturing", "validate the change"]),
    ],
    "civil": [
        ("During construction you notice cracks in a recently cast slab. What would you do?",
         ["assess severity and safety", "identify likely causes", "consult and document", "repair and prevention"]),
        ("A project is running behind schedule and over budget. How would you help get it back on track?",
         ["find the critical path", "reallocate resources", "communicate with stakeholders", "control changes"]),
    ],
}
GENERIC_SCENARIOS = [
    ("You're halfway through a project and realise the approach you chose isn't going to work. What do you do?",
     ["recognise it early", "evaluate alternatives", "communicate with the team", "adjust the plan"]),
]

TRANSITIONS = {
    "introduction": ["Let's start with you.", "To begin,", "Let's kick things off."],
    "deep_dive": ["I'd like to dig into your experience a bit.", "Let's talk about some of the work on your resume.", "Something on your resume caught my eye."],
    "decision": ["Staying with that for a moment,", "I'd like to go a little deeper there.", "Building on that,"],
    "second_experience": ["Let's look at another part of your background.", "Moving on to something else you've done,", "I also wanted to ask about this."],
    "skill_applied": ["Let's switch to your technical skills.", "Shifting to the technical side,", "I'd like to talk about your skills."],
    "scenario": ["Let me give you a situation.", "Here's a hypothetical for you.", "Let's try a problem-solving question."],
    "skill_depth": ["A bit more technical now.", "Let's go one level deeper.", "One more technical question."],
    "teamwork": ["Let's talk about working with others.", "Switching to teamwork,", "I'd like to hear about collaboration."],
    "setback": ["Next, about handling challenges.", "Let's talk about a tougher moment.", "Shifting gears a little,"],
    "closing": ["We're almost done.", "To wrap up,", "Last question from me."],
}


# Everyday office tools are not "technical work" worth a deep-dive decision question.
GENERIC_TOOLS = {"excel", "microsoft office", "ms office", "office", "google workspace", "word", "powerpoint", "google docs", "google sheets"}


def _department_key(department: str | None) -> str:
    return str(department or "").strip().lower()


class QuestionService:
    def __init__(self, llm_client: LLMClient):
        self.llm_client = llm_client

    async def generate_questions(self, resume: dict[str, Any], interview_context: dict[str, Any] | None = None) -> list[dict]:
        interview_context = dict(interview_context or {})
        structured_resume = resume.get("structured_resume") or {}
        skills = list(resume.get("extracted_skills", []))
        raw_text = resume.get("raw_text")
        if raw_text:
            # Re-parse with the current parser so older uploads benefit from
            # improved extraction without a new upload.
            from app.services.resume_parser_service import ResumeParserService
            from app.services.skill_service import SkillService

            structured_resume = ResumeParserService().parse(raw_text)
            skills = SkillService().extract_skills(raw_text, structured_resume)
        skills = self._unique_strings(skills + list(structured_resume.get("skills", [])) + list(structured_resume.get("tools", [])))
        seed_source = f"{resume.get('_id', '')}:{datetime.now(timezone.utc).isoformat()}"
        rng = random.Random(int(hashlib.sha256(seed_source.encode()).hexdigest()[:12], 16))
        topic_plan = self._build_topic_plan(
            structured_resume, skills, interview_context.get("difficulty", "medium"),
            candidate=interview_context.get("candidate") or {}, rng=rng,
        )
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
            "You are a friendly, experienced interviewer. Rewrite the next interview question at the requested "
            "difficulty, keeping its topic. It is read aloud, so use one or two short spoken sentences, ask one "
            "thing, and avoid trivia. Return one strict JSON object with keys question, transition (a short "
            "spoken lead-in), expected_answer, expected_points (array of strings), and question_type.\n\n"
            + json.dumps({"difficulty": difficulty, "next_question": question, "previous_answer": answer_text[:3000]}, ensure_ascii=False)
        )
        transition = ""
        try:
            parsed = self.llm_client.parse_json(await self.llm_client.generate(prompt))
            if not isinstance(parsed, dict):
                raise ValueError("Adaptive question response must be a JSON object.")
            text = str(parsed.get("question", "")).strip()
            expected = str(parsed.get("expected_answer", "")).strip()
            points = self._normalize_list(parsed.get("expected_points", []))
            transition = str(parsed.get("transition", "")).strip()[:160]
            if not text or not expected or not points:
                raise ValueError("Adaptive question response was incomplete.")
        except (LLMClientError, ValueError, json.JSONDecodeError):
            text, expected, points = self._adaptive_fallback(question, difficulty)

        adapted = dict(question)
        adapted.update({
            "difficulty": requested_difficulty,
            "question": text,
            "expected_answer": expected,
            "expected_points": points,
            "key_points": points,
        })
        if transition:
            adapted["transition"] = transition
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
            "You are a supportive, experienced interviewer. Ask ONE natural follow-up question that responds to "
            "what the candidate actually said. If the answer was weak (easy), help them by narrowing to a concrete, "
            "answerable part or asking for an example; never quiz on trivia. If it was strong (hard), probe a "
            "trade-off, decision, or result they mentioned. It is spoken aloud: one or two short sentences, and "
            "start with a brief natural acknowledgement in 'transition' (for example 'Interesting.' or 'Okay.'). "
            "Return strict JSON with question, transition, expected_answer, expected_points (array). Do not repeat "
            "the original question.\n\n"
            + json.dumps({
                "difficulty": difficulty,
                "question": question.get("question", ""),
                "topic": question.get("topic_focus", question.get("skill", "the topic")),
                "answer": answer_text[:3000],
                "missing_points": evaluation.get("missing_points", []),
            }, ensure_ascii=False)
        )
        transition = ""
        try:
            parsed = self.llm_client.parse_json(await self.llm_client.generate(prompt))
            if not isinstance(parsed, dict):
                raise ValueError("Follow-up response must be a JSON object.")
            text = str(parsed.get("question", "")).strip()
            expected = str(parsed.get("expected_answer", "")).strip()
            points = self._normalize_list(parsed.get("expected_points", []))
            transition = str(parsed.get("transition", "")).strip()[:160]
            if not text or not expected or not points:
                raise ValueError("Follow-up response was incomplete.")
        except (LLMClientError, ValueError, json.JSONDecodeError):
            text, expected, points = self._follow_up_fallback(question, evaluation, difficulty)
            transition = "Okay, let me ask about that a little differently." if difficulty == "easy" else "That's interesting."

        return {
            "question_id": question_id,
            "skill": question.get("skill", "General"),
            "difficulty": requested_difficulty,
            "question_type": "scenario" if difficulty == "hard" else "practical",
            "topic_focus": question.get("topic_focus", question.get("skill", "General")),
            "source_section": question.get("source_section", "skills"),
            "question": text,
            "transition": transition,
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
            text = f"Let's keep it practical: can you walk me through how you've used {topic}, step by step?"
        elif difficulty == "hard":
            text = f"When you work with {topic}, what trade-offs do you weigh, and where have you seen an approach break down?"
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
            focus = points[0] if points else f"your work with {topic}"
            text = f"Could you tell me about {focus}? A small, concrete example is perfect."
            expected_points = points or [f"Give a clear example related to {topic}"]
        else:
            text = f"You clearly know {topic}. What's a decision there you'd make differently today, and why?"
            expected_points = self._normalize_list(question.get("expected_points", [])) or [
                f"Discuss a trade-off or edge case for {topic}"
            ]
        expected = "Address the follow-up directly and support the response with a relevant example or rationale."
        return text, expected, expected_points

    def _build_prompt(self, structured_resume: dict[str, Any], skills: list[str], topic_plan: list[dict], interview_context: dict[str, Any] | None) -> str:
        resume_context = {
            key: structured_resume.get(key, [])
            for key in ("education", "experience", "internships", "projects", "skills", "tools", "certifications", "achievements", "activities", "summary_lines")
        }
        # Raw "raw_text" fields are redundant with the structured fields; drop them to keep the prompt focused.
        for key in ("experience", "internships", "projects"):
            resume_context[key] = [{k: v for k, v in item.items() if k != "raw_text"} for item in resume_context[key]]
        plan = [{k: v for k, v in item.items() if k not in {"technologies", "highlights"}} for item in topic_plan]
        payload = {
            "skills": skills,
            "interview_plan": plan,
            "resume_context": resume_context,
            "interview_context": {k: v for k, v in (interview_context or {}).items() if k != "seed"},
        }
        return f"{QUESTION_GENERATION_PROMPT}\n\nInterview data:\n{json.dumps(make_json_safe(payload), indent=2)}"

    # ------------------------------------------------------------ planning

    @staticmethod
    def _technical(technologies: list[str]) -> list[str]:
        return [tech for tech in technologies if str(tech).strip().lower() not in GENERIC_TOOLS]

    def _entries(self, structured_resume: dict[str, Any]) -> list[dict[str, Any]]:
        """Projects and roles, most technical and substantial first."""
        entries: list[dict[str, Any]] = []
        for project in structured_resume.get("projects", []) or []:
            name = self._clean_text(str(project.get("name", "")))
            if name:
                entries.append({"kind": "project", "label": name, "org": project.get("context", ""), "section": "projects",
                                "technologies": project.get("technologies", []), "highlights": project.get("highlights", []),
                                "context": project.get("description", "")})
        for section in ("experience", "internships"):
            for item in structured_resume.get(section, []) or []:
                title = self._clean_text(str(item.get("title", "")))
                org = self._clean_text(str(item.get("company", "")))
                if title or org:
                    entries.append({"kind": item.get("kind", "work" if section == "experience" else "internship"),
                                    "label": title or org, "org": org, "section": section,
                                    "technologies": item.get("technologies", []), "highlights": item.get("highlights", []),
                                    "context": item.get("description", "")})
        for entry in entries:
            entry["technologies"] = self._technical(entry["technologies"])
        # Technical work first (projects, then roles using technical tools, then
        # research); unrelated jobs last.
        def rank(entry: dict[str, Any]) -> tuple[int, int]:
            score = 3 if entry["kind"] == "project" else 0
            score += 2 if entry["technologies"] else 0
            score += 1 if entry["kind"] == "research" else 0
            return (-score, -len(entry["highlights"]))
        return sorted(entries, key=rank)

    def _build_topic_plan(
        self,
        structured_resume: dict[str, Any],
        skills: list[str],
        difficulty: str = "medium",
        candidate: dict[str, Any] | None = None,
        rng: random.Random | None = None,
    ) -> list[dict[str, Any]]:
        rng = rng or random.Random(0)
        candidate = candidate or {}
        department = _department_key(candidate.get("department"))
        field = DEPARTMENT_FIELDS.get(department, "your field")
        entries = self._entries(structured_resume)
        # Resume skills first, then general topics so a thin resume still gets distinct questions.
        skill_pool = self._unique_strings(skills + ["problem solving", "learning new tools", "time management", "technical communication", "attention to detail"])
        used_skills: set[str] = set()

        def take_skill(preferred: list[str] | None = None) -> str:
            for skill in (preferred or []) + skill_pool:
                if self._normalize_key(skill) not in used_skills:
                    used_skills.add(self._normalize_key(skill))
                    return skill
            return f"topic {len(used_skills) + 1}"

        first = entries[0] if entries else None
        second = entries[1] if len(entries) > 1 else None
        scenarios = list(DEPARTMENT_SCENARIOS.get(department, [])) + GENERIC_SCENARIOS
        scenario_text, scenario_points = scenarios[rng.randrange(len(scenarios))]
        education = (structured_resume.get("education") or [{}])[0]
        degree = self._clean_text(str(education.get("degree") or "")) or field

        plan: list[dict[str, Any]] = []
        for index, arc in enumerate(INTERVIEW_ARC):
            slot = arc["slot"]
            item: dict[str, Any] = {"question_id": index + 1, "question_type": arc["question_type"], "slot": slot,
                                    "technologies": [], "highlights": [], "context": "", "anchor": ""}
            if slot == "introduction":
                item.update(topic_focus="Background and motivation", source_section="summary", skill="Communication",
                            context=f"Studying {degree}" + (f", year {candidate.get('year')}" if candidate.get("year") else ""))
            elif slot in {"deep_dive", "decision"} and first:
                skill = take_skill(first["technologies"]) if slot == "decision" else (first["technologies"][0] if first["technologies"] else "Project work")
                item.update(topic_focus=f"{first['label']}" + (" — key decision" if slot == "decision" else ""), source_section=first["section"],
                            skill=skill, anchor=first["label"], org=first["org"], kind=first["kind"],
                            technologies=first["technologies"], highlights=first["highlights"], context=first["context"][:400])
            elif slot == "second_experience" and second:
                item.update(topic_focus=second["label"], source_section=second["section"],
                            skill=second["technologies"][0] if second["technologies"] else "Experience",
                            anchor=second["label"], org=second["org"], kind=second["kind"],
                            technologies=second["technologies"], highlights=second["highlights"], context=second["context"][:400])
            elif slot == "scenario":
                item.update(topic_focus="Problem-solving scenario", source_section="scenario", skill="Problem solving",
                            context=scenario_text, scenario_points=scenario_points)
            elif slot == "teamwork":
                team_entry = next((entry for entry in entries if re.search(r"team|led|collaborat|group", " ".join(entry["highlights"]), re.I)), None)
                item.update(topic_focus="Teamwork", source_section="behavioral", skill="Collaboration",
                            anchor=(team_entry["org"] or team_entry["label"]) if team_entry else "")
            elif slot == "setback":
                item.update(topic_focus="Handling setbacks", source_section="behavioral", skill="Resilience")
            elif slot == "closing":
                item.update(topic_focus="Goals and motivation", source_section="summary", skill="Motivation", context=field)
            else:
                # Skill slots, and fallbacks for missing projects or experience.
                skill = take_skill()
                item.update(topic_focus=f"{skill} in practice" if slot != "skill_depth" else f"{skill} fundamentals",
                            source_section="skills", skill=skill, anchor=skill,
                            question_type="practical" if slot != "skill_depth" else "conceptual")
            item["difficulty"] = self._slot_difficulty(difficulty, index, item["question_type"])
            item["transition"] = rng.choice(TRANSITIONS.get(slot, [""]))
            plan.append(item)

        # Topics must be unique for validation and variety.
        seen: set[str] = set()
        for item in plan:
            key = self._normalize_key(item["topic_focus"])
            if key in seen:
                skill = take_skill()
                item.update(topic_focus=f"{skill} in practice", source_section="skills", skill=skill, anchor=skill, slot="skill_applied",
                            question_type="practical")
                key = self._normalize_key(item["topic_focus"])
            seen.add(key)
        return plan

    @staticmethod
    def _slot_difficulty(difficulty: str, index: int, question_type: str) -> str:
        level = difficulty if difficulty in QUESTION_DIFFICULTIES else "medium"
        if level == "interview_ready":
            level = ("low", "medium", "medium", "medium", "medium", "hard", "hard", "medium", "medium", "low")[index]
        if question_type in {"introduction", "closing"}:
            return "low" if level in {"low", "easy"} else "medium"
        return level

    def _validate_questions(self, questions: list[dict], topic_plan: list[dict]) -> list[dict]:
        if len(questions) != 10:
            return []

        normalized_topics: set[str] = set()
        normalized_questions: list[dict] = []

        for index, question in enumerate(questions, start=1):
            plan_item = topic_plan[index - 1] if index - 1 < len(topic_plan) else {}
            difficulty = str(plan_item.get("difficulty", "medium")).lower().strip()
            question_type = str(question.get("question_type", plan_item.get("question_type", "conceptual"))).lower().strip()
            if question_type == "situational":
                question_type = "behavioral"
            topic_focus = str(question.get("topic_focus", plan_item.get("topic_focus", ""))).strip()
            text = str(question.get("question", "")).strip()
            if difficulty not in QUESTION_DIFFICULTIES or question_type not in QUESTION_TYPES or not topic_focus or not text:
                return []
            if self._normalize_key(topic_focus) in normalized_topics:
                return []

            expected_points = self._normalize_list(question.get("expected_points", question.get("key_points", [])))
            if not expected_points:
                return []

            normalized_topics.add(self._normalize_key(topic_focus))
            normalized_questions.append({
                "question_id": index,
                "skill": str(question.get("skill", plan_item.get("skill", "General"))).strip() or "General",
                "difficulty": difficulty,
                "question_type": question_type,
                "topic_focus": topic_focus,
                "source_section": str(question.get("source_section", plan_item.get("source_section", "skills"))).strip() or "skills",
                "question": text,
                "transition": str(question.get("transition", plan_item.get("transition", ""))).strip()[:160],
                "expected_answer": str(question.get("expected_answer", "")).strip(),
                "expected_points": expected_points,
                "key_points": expected_points,
            })

        return normalized_questions

    def _build_fallback_questions(self, topic_plan: list[dict]) -> list[dict]:
        questions: list[dict] = []
        for index, plan_item in enumerate(topic_plan, start=1):
            question, expected_answer, expected_points = self._build_question_components(plan_item)
            questions.append({
                "question_id": index,
                "skill": plan_item["skill"],
                "difficulty": plan_item["difficulty"],
                "question_type": plan_item["question_type"],
                "topic_focus": plan_item["topic_focus"],
                "source_section": plan_item["source_section"],
                "question": question,
                "transition": plan_item.get("transition", ""),
                "expected_answer": expected_answer,
                "expected_points": expected_points,
                "key_points": expected_points,
            })
        return questions

    def _build_question_components(self, plan_item: dict[str, Any]) -> tuple[str, str, list[str]]:
        """Interviewer-style questions built from resume details when no model is available."""
        slot = plan_item.get("slot", "skill_applied")
        difficulty = plan_item.get("difficulty", "medium")
        anchor = self._clean_text(str(plan_item.get("anchor", "") or plan_item.get("topic_focus", "")))
        org = self._clean_text(str(plan_item.get("org", "")))
        where = f" at {org}" if org and org.lower() not in anchor.lower() else ""
        technologies = self._unique_strings(plan_item.get("technologies", []))
        highlights = self._unique_strings(plan_item.get("highlights", []))
        tech = technologies[0] if technologies else ""
        kind = plan_item.get("kind", "")
        skill = plan_item.get("skill", "")

        if slot == "introduction":
            question = "Could you walk me through your background, and what got you interested in this field?"
            expected_answer = "A short, structured story: current studies, key experiences, and motivation."
            points = ["current studies or role", "one or two relevant experiences", "what motivates them", "concise and structured"]
        elif slot == "deep_dive":
            if kind == "project":
                question = f"Tell me about {anchor}. What problem were you solving, and what was your part in it?"
            elif kind == "research":
                question = f"I see you worked as {self._article(anchor)}{where}. What were you researching, and what did you contribute?"
            else:
                question = f"Tell me about your time as {self._article(anchor)}{where}. What were you responsible for, and what are you proudest of?"
            expected_answer = "Context, personal responsibilities, actions taken, and a concrete result."
            points = ["context and goal", "personal contribution", "specific actions", "result or impact"]
            if highlights:
                points.append(self._shorten(highlights[0]))
        elif slot == "decision":
            if tech:
                question = f"In that work you used {tech}. Walk me through a decision you made with it. What options did you consider, and why did you choose what you did?"
            else:
                question = "Walk me through one important decision you made in that work. What options did you have, and why did you go the way you did?"
            expected_answer = "A specific decision, the alternatives, the reasoning, and how it turned out."
            points = ["specific decision", "alternatives considered", "reasoning or trade-off", "outcome"]
        elif slot == "second_experience":
            if kind == "research":
                question = f"You also worked as {self._article(anchor)}{where}. What was the most challenging part of that work, and how did you handle it?"
            elif kind == "project":
                question = f"Let's talk about {anchor}. What was the hardest technical problem there, and how did you solve it?"
            elif technologies:
                question = f"You were also {self._article(anchor)}{where}. What was the hardest problem you ran into there, and how did you solve it?"
            else:
                question = f"You also worked as {self._article(anchor)}{where}. What did that role teach you that you'd bring to an engineering job?"
            expected_answer = "A specific challenge or lesson, actions taken, and transferable learning."
            points = ["specific challenge or lesson", "actions taken", "result", "transferable skill"]
        elif slot == "scenario":
            question = plan_item.get("context") or GENERIC_SCENARIOS[0][0]
            expected_answer = "A calm, structured approach: understand the problem, investigate, act, and verify."
            points = list(plan_item.get("scenario_points") or GENERIC_SCENARIOS[0][1])
        elif slot == "teamwork":
            if anchor:
                question = f"Thinking about your time at {anchor}, tell me about a moment when the team disagreed or got stuck. What did you do?"
            else:
                question = "Tell me about a time you worked in a team that disagreed or got stuck. What did you do?"
            expected_answer = "A STAR story: situation, task, the candidate's own actions, and the result."
            points = ["situation", "their role", "actions they took", "result and what they learned"]
        elif slot == "setback":
            question = "Tell me about something that didn't go as planned. What happened, and what did you do next?"
            expected_answer = "An honest example, ownership of their part, the recovery, and the lesson."
            points = ["honest example", "ownership", "how they recovered", "lesson applied later"]
        elif slot == "closing":
            question = "Where do you see yourself after graduating, and what kind of role are you hoping to grow into?"
            expected_answer = "Clear, realistic goals connected to their skills and experiences."
            points = ["specific goal", "link to their skills or experience", "realistic next steps"]
        elif slot == "skill_depth":
            if difficulty in {"low", "easy"}:
                question = f"How would you explain {skill} to a first-year student, and where have you used it yourself?"
            elif difficulty == "hard":
                question = f"With {skill}, what's a common mistake people make, and how would you avoid it on a real project?"
            else:
                question = f"What's something about {skill} that took you a while to really understand? How did it finally click?"
            expected_answer = f"An accurate explanation of {skill} tied to their own use of it."
            points = [f"accurate understanding of {skill}", "personal example", "practical implications"]
        else:  # skill_applied
            if difficulty in {"low", "easy"}:
                question = f"Your resume mentions {skill}. Can you tell me about a time you actually used it?"
            elif difficulty == "hard":
                question = f"Tell me about the most complex thing you've done with {skill}. What made it hard, and what would you improve now?"
            else:
                question = f"Your resume mentions {skill}. Walk me through something you built or worked on with it. What was your approach?"
            expected_answer = f"A concrete example of using {skill}, the approach, and the result."
            points = ["concrete example", "approach or steps", "result", f"correct use of {skill}"]

        if difficulty == "hard" and slot in {"deep_dive", "decision", "second_experience", "scenario"}:
            question += " Also, what would you do differently with more time or at a larger scale?"
            points.append("reflection on trade-offs or scale")
        return question, expected_answer, self._unique_strings(points)[:5]

    @staticmethod
    def _article(phrase: str) -> str:
        phrase = phrase.strip()
        if not phrase:
            return "a team member"
        if re.match(r"^(the|a|an)\b", phrase, re.I):
            return phrase
        return f"{'an' if phrase[:1].lower() in 'aeiou' else 'a'} {phrase}"

    @staticmethod
    def _shorten(text: str, words: int = 10) -> str:
        parts = text.split()
        return " ".join(parts[:words]).rstrip(",.;")

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

    def _clean_text(self, value: str) -> str:
        return re.sub(r"\s+", " ", value).strip()

    def _normalize_key(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", value.lower())
