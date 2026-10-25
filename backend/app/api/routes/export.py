"""Downloadable interview report, data, and transcript exports."""
from __future__ import annotations

import io
import json
from datetime import datetime
from typing import Annotated

import pymupdf as fitz
from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse

from app.api.deps import get_current_user, get_interview_service
from app.services.interview_service import InterviewService

router = APIRouter(prefix="/interviews", tags=["exports"])


def _wrap_line(text: str, width: float, font: str, size: float) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and fitz.get_text_length(candidate, fontname=font, fontsize=size) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _report_pdf(data: dict) -> bytes:
    interview = data.get("interview", {})
    score = data.get("score") or {}
    answers = data.get("answers", [])
    questions = {item.get("question_id"): item for item in interview.get("questions", [])}
    lines: list[tuple[str, str]] = [
        ("h1", "AI Interview Coach Practice Report"),
        ("body", f"Interview: {interview.get('id', '')}"),
        ("body", f"Date: {interview.get('created_at', '')}"),
        ("h2", f"Performance score: {float(score.get('performance_score', score.get('overall_score', 0))):.1f}/100"),
        ("body", f"Readiness: {score.get('readiness_category', 'Assessment unavailable')}"),
        ("body", f"Completion: {score.get('answered_questions', 0)} of {score.get('total_questions', len(interview.get('questions', [])))} answered ({score.get('completion_percentage', 0)}%)"),
        ("body", f"Assessment reliability: {score.get('assessment_reliability', 'Limited sample')}. {score.get('assessment_note', '')}"),
        ("h2", "Scoring rubric"),
        ("body", score.get("scoring_rubric", "Unanswered questions contribute zero; evaluation failures are excluded.")),
    ]
    for title, content in (score.get("report") or {}).items():
        lines.append(("h2", str(title)))
        if isinstance(content, list):
            lines.extend(("body", f"• {item}") for item in content)
        else:
            lines.append(("body", str(content)))
    if answers:
        lines.append(("h2", "Answer summary"))
        for answer in answers:
            question = questions.get(answer.get("question_id"), {})
            lines.append(("h2", f"Q{answer.get('question_id')}: {question.get('question', '')}"))
            lines.append(("body", str(answer.get("answer_text", ""))))
    if score.get("question_scores"):
        lines.append(("h2", "Question evaluations"))
        for item in score["question_scores"]:
            status_label = item.get("answer_status", "unknown")
            score_label = "not scored" if status_label == "evaluation_failed" else "0 contribution" if status_label in {"unanswered", "skipped"} else f"{item.get('score', 0)}/100"
            lines.append(("body", f"Q{item.get('question_id')}: {status_label} — {score_label}"))
            if item.get("answer_status") == "evaluation_failed":
                lines.append(("body", "Evaluation unavailable; excluded from the performance denominator."))

    document = fitz.open()
    page = document.new_page(width=fitz.paper_size("a4")[0], height=fitz.paper_size("a4")[1])
    margin = 54
    y = margin
    fonts = {"h1": (18, "hebo", 12), "h2": (12, "hebo", 7), "body": (10, "helv", 5)}
    for kind, text in lines:
        size, font, gap = fonts[kind]
        safe_text = text.encode("latin-1", "replace").decode("latin-1")
        for wrapped in _wrap_line(safe_text, page.rect.width - 2 * margin, font, size):
            if y + size * 1.5 > page.rect.height - margin:
                page = document.new_page(width=fitz.paper_size("a4")[0], height=fitz.paper_size("a4")[1])
                y = margin
            page.insert_text((margin, y + size), wrapped, fontname=font, fontsize=size)
            y += size * 1.4
        y += gap
    try:
        return document.tobytes()
    finally:
        document.close()


async def _get_owned_interview(
    interview_id: str,
    current_user: dict,
    interview_service: InterviewService,
) -> dict:
    return await interview_service.get_interview(interview_id, current_user["id"])


@router.get("/{interview_id}/export/pdf")
async def export_pdf(
    interview_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    interview_service: Annotated[InterviewService, Depends(get_interview_service)],
) -> StreamingResponse:
    data = await _get_owned_interview(interview_id, current_user, interview_service)
    if not data.get("score"):
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Complete the interview before exporting a report.")
    payload = _report_pdf(data)
    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="interview-{interview_id}-report.pdf"'},
    )


@router.get("/{interview_id}/export/json")
async def export_json(
    interview_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    interview_service: Annotated[InterviewService, Depends(get_interview_service)],
) -> Response:
    data = await _get_owned_interview(interview_id, current_user, interview_service)
    payload = json.dumps(
        data,
        ensure_ascii=False,
        indent=2,
        default=lambda value: value.isoformat() if isinstance(value, datetime) else str(value),
    )
    return Response(
        payload,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="interview-{interview_id}.json"'},
    )


@router.get("/{interview_id}/export/transcript")
async def export_transcript(
    interview_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    interview_service: Annotated[InterviewService, Depends(get_interview_service)],
) -> Response:
    data = await _get_owned_interview(interview_id, current_user, interview_service)
    questions = {item.get("question_id"): item for item in data["interview"].get("questions", [])}
    score = data.get("score") or {}
    lines = [
        "AI Interview Coach Transcript",
        f"Performance score: {score.get('performance_score', score.get('overall_score', 'Unavailable'))}/100",
        f"Readiness: {score.get('readiness_category', 'Unavailable')}",
        f"Completion: {score.get('answered_questions', 0)}/{score.get('total_questions', len(data['interview'].get('questions', [])))} ({score.get('completion_percentage', 0)}%)",
        f"Assessment: {score.get('assessment_reliability', 'Unavailable')}. {score.get('assessment_note', '')}",
        "",
    ]
    answers = {answer.get("question_id"): answer for answer in data.get("answers", [])}
    score_rows = {item.get("question_id"): item for item in score.get("question_scores", [])}
    for question_id, question in questions.items():
        answer = answers.get(question_id, {})
        question_score = score_rows.get(question_id, {})
        answer_status = question_score.get("answer_status", "unanswered")
        answer_score = "not evaluated" if answer_status == "evaluation_failed" else "0 contribution" if answer_status in {"unanswered", "skipped"} else f"{question_score.get('score', 'not evaluated')}/100"
        lines.extend(
            [
                f"Q{question_id}: {question.get('question', '')}",
                f"Status: {answer_status}; Score: {answer_score}",
                f"Answer: {answer.get('transcript') or answer.get('answer_text', '') or '[No answer recorded]'}",
                "",
            ]
        )
    return Response(
        "\n".join(lines),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="interview-{interview_id}-transcript.txt"'},
    )
