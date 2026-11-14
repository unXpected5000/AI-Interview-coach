"""The optimiser reports measured scores and honest suggestions."""
import json

from app.services.resume_optimizer_service import ResumeOptimizerService
from app.services.resume_parser_service import ResumeParserService
from app.services.resume_quality import analyse_bullet, bullet_improvements, suggest_bullet, target_keywords_for
from app.services.skill_service import SkillService
from tests.test_resume_and_questions import RESUME


def service():
    return ResumeOptimizerService(
        resume_repository=None, optimizer_repository=None, resume_parser_service=ResumeParserService(),
        skill_service=SkillService(), llm_client=None,
    )


def local_result(text=RESUME, role="Design Engineer", department="Mech"):
    svc = service()
    svc._department = department
    structured = ResumeParserService().parse(text)
    resume = {"raw_text": text, "extracted_skills": SkillService().extract_skills(text, structured)}
    return svc, svc._build_local_result(resume, structured, role, None, None)


def test_scores_are_measured_not_constants():
    _svc, strong = local_result()
    _svc, thin = local_result("Jane\nSKILLS\nExcel\n", role="Design Engineer")
    for key in ("project_quality", "technical_depth", "experience_strength", "impact_statements", "resume_structure"):
        assert strong["score_breakdown"][key]["score"] != thin["score_breakdown"][key]["score"], key
    assert thin["score_breakdown"]["project_quality"]["score"] == 0
    assert {"solidworks", "ansys"} <= set(strong["matched_keywords"])


def test_model_cannot_override_measured_scores_but_can_add_advice():
    svc, local = local_result()
    parsed = {"score_breakdown": {"impact_statements": {"score": 99, "recommendations": ["Lead with outcomes."]}}}
    merged = svc._normalize_result(parsed, local)
    assert merged["score_breakdown"]["impact_statements"]["score"] == local["score_breakdown"]["impact_statements"]["score"]
    assert "Lead with outcomes." in merged["score_breakdown"]["impact_statements"]["recommendations"]
    assert merged["bullet_improvements"] == local["bullet_improvements"]


def test_bullet_analysis_accepts_present_tense_and_flags_weak_openers():
    assert analyse_bullet("Perform daily experiments with graduate students in the lab")["strong_verb"]
    assert analyse_bullet("Expedite construction of a prototype sensor improving SNR by 89%")["issues"] == []
    weak = analyse_bullet("Responsible for the website of the college fest")
    assert "starts with a passive phrase" in weak["issues"]
    suggestion = suggest_bullet("Responsible for the website of the college fest", weak)
    assert suggestion.startswith("Delivered the website") and "[measurable outcome" in suggestion


def test_suggestions_never_invent_numbers_or_prefix_contributed():
    _svc, result = local_result()
    for item in bullet_improvements(ResumeParserService().parse(RESUME)):
        assert "Contributed to" not in item["suggestion"]
        if "no measurable result" in item["issues"]:
            assert "[" in item["suggestion"]
    assert all("Contributed to" not in line for line in sum(result["rewritten_sections"].values(), []))
    json.dumps(result)  # serialisable for storage


def test_department_keywords_used_when_role_is_generic():
    assert "staad.pro" in target_keywords_for("Graduate Engineer Trainee", "Civil")
    assert "pandas" in target_keywords_for("Data Analyst", None)


def test_api_response_model_keeps_measured_extras():
    from app.schemas.resume_optimizer_schema import ResumeOptimizationResult

    _svc, local = local_result()
    assert local["bullet_improvements"], "fixture should produce at least one improvement"
    dumped = ResumeOptimizationResult.model_validate(local).model_dump()
    assert dumped["analysis_version"] == local["analysis_version"]
    assert dumped["matched_keywords"] == local["matched_keywords"]
    assert dumped["bullet_improvements"][0]["suggestion"] == local["bullet_improvements"][0]["suggestion"]


def test_irregular_past_tense_counts_as_action_verb():
    analysis = analyse_bullet("Ran CFD studies of heat exchanger fins for the faculty review")
    assert analysis["strong_verb"]
    assert not suggest_bullet("Ran CFD studies of heat exchanger fins for the faculty review", analysis).startswith("Delivered ran")
