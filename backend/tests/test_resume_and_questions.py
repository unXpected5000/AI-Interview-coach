"""Resume parsing on realistic PDF text, and interviewer-style question planning."""
import asyncio
import random

from app.ai.llm_client import LLMClientError
from app.services.question_service import INTERVIEW_ARC, QuestionService
from app.services.resume_parser_service import ResumeParserService
from app.services.skill_service import SkillService

# Layout as PyMuPDF extracts many resumes: no bullet glyphs, a month split
# from its year, caps headings with qualifiers, and label-prefixed skills.
RESUME = """Asha Patel
Mumbai | asha@example.com
EDUCATION
Bachelor of Engineering, Mechanical Engineering
University of Mumbai
CGPA: 8.4/10
Expected Graduation: 2027
RELEVANT EXPERIENCE
Design Lead
June
2024 - Present
Team Torque Formula Student
Mumbai, MH
Led a team of 6 designing the chassis in SolidWorks and validating it with ANSYS
simulations before fabrication.
Reduced frame weight by 12% while meeting the competition safety rules.
RESEARCH EXPERIENCE
Undergraduate Researcher
January 2024 - May 2024
Department of Thermal Engineering
Mumbai, MH
Ran CFD studies of heat exchanger fins and tabulated results in Excel for the
faculty review.
ACADEMIC PROJECTS
Smart Irrigation Controller
Built an Arduino based controller that reads soil moisture sensors and schedules pumps.
TECHNICAL SKILLS
Technical: SolidWorks, ANSYS, AutoCAD, MATLAB, Microsoft
Office
Programming: C++, Python
"""


class Offline:
    async def generate(self, _prompt):
        raise LLMClientError("offline")

    def parse_json(self, _text):
        raise LLMClientError("offline")


def test_parser_recognises_qualified_headings_and_entries_without_bullets():
    parsed = ResumeParserService().parse(RESUME)
    roles = {entry["title"]: entry for entry in parsed["experience"]}
    assert set(roles) == {"Design Lead", "Undergraduate Researcher"}
    lead = roles["Design Lead"]
    assert lead["company"] == "Team Torque Formula Student"
    assert lead["dates"] == "June 2024 - Present"
    assert lead["location"] == "Mumbai, MH"
    assert {"SolidWorks", "ANSYS"} <= set(lead["technologies"])
    assert len(lead["highlights"]) == 2
    assert roles["Undergraduate Researcher"]["kind"] == "research"
    assert parsed["projects"][0]["name"] == "Smart Irrigation Controller"
    assert "Arduino" in parsed["projects"][0]["technologies"]
    education = parsed["education"][0]
    assert education["degree"].startswith("Bachelor of Engineering")
    assert education["institution"] == "University of Mumbai"
    assert education["score"].startswith("CGPA")


def test_skill_lines_drop_labels_and_rejoin_wrapped_items():
    parsed = ResumeParserService().parse(RESUME)
    assert parsed["skills"] == ["SolidWorks", "ANSYS", "AutoCAD", "MATLAB", "Microsoft Office", "C++", "Python"]
    skills = SkillService().extract_skills(RESUME, parsed)
    assert "Technical: SolidWorks" not in skills and "Testing" not in skills
    assert {"CFD", "Arduino", "Excel"} <= set(skills)


def test_question_plan_follows_a_real_interview_arc():
    service = QuestionService(Offline())
    parsed = ResumeParserService().parse(RESUME)
    plan = service._build_topic_plan(parsed, SkillService().extract_skills(RESUME, parsed), "medium",
                                     candidate={"department": "Mech", "year": 3}, rng=random.Random(1))
    assert [item["question_type"] for item in plan] == [arc["question_type"] for arc in INTERVIEW_ARC]
    questions = service._build_fallback_questions(plan)
    texts = [question["question"] for question in questions]
    assert "background" in texts[0]
    assert "Smart Irrigation Controller" in texts[1]  # projects lead the deep dive
    assert any("Design Lead" in text or "Team Torque" in text for text in texts)
    assert "failing earlier than expected" in texts[5] or "reduce the cost" in texts[5]  # mechanical scenario
    assert "after graduating" in texts[9]
    assert all(question["transition"] for question in questions)
    assert len({question["topic_focus"] for question in questions}) == 10
    for text in texts:
        assert "core concept behind" not in text and "For someone less familiar" not in text


def test_generate_questions_reparses_raw_text_for_older_uploads():
    resume = {"_id": "r1", "raw_text": RESUME, "structured_resume": {"projects": [], "experience": []}, "extracted_skills": ["Testing"]}
    questions = asyncio.run(QuestionService(Offline()).generate_questions(resume, {"difficulty": "medium"}))
    assert len(questions) == 10
    assert any("Smart Irrigation Controller" in question["question"] for question in questions)


def test_thin_resume_still_gets_ten_distinct_questions():
    service = QuestionService(Offline())
    plan = service._build_topic_plan({"skills": ["Python"]}, ["Python"])
    assert len({item["topic_focus"] for item in plan}) == 10
