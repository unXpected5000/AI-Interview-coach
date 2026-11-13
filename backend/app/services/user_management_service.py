"""Self-service profile updates plus HOD and operator user management.

Authorization is enforced here and in route dependencies, never only in the UI.
HOD views expose aggregate progress only: no resumes, answers, or transcripts.
"""
from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException, status

from app.models.user_model import (
    ROLE_HOD,
    ROLE_OPERATOR,
    ROLE_STUDENT,
    is_email_verified,
    serialize_user,
    user_role,
)
from app.repositories.interview_repository import InterviewRepository
from app.repositories.score_repository import ScoreRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user_schema import ProfileUpdateRequest, RoleUpdateRequest, StaffStudentUpdateRequest
from app.services.profile_rules import normalize_department, validate_year
from app.services.readiness_service import build_assessment_summary

MAX_PAGE_SIZE = 50
STUDENT_ROLE_QUERY = {"$or": [{"role": ROLE_STUDENT}, {"role": {"$exists": False}}, {"role": None}]}


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")


def _invalid(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


def _department(value: str | None) -> str:
    try:
        return normalize_department(value)
    except ValueError as exc:
        raise _invalid(str(exc)) from exc


def _year(value: int | None) -> int:
    try:
        return validate_year(value)
    except ValueError as exc:
        raise _invalid(str(exc)) from exc


class UserManagementService:
    def __init__(
        self,
        user_repository: UserRepository,
        interview_repository: InterviewRepository,
        score_repository: ScoreRepository,
    ):
        self.users = user_repository
        self.interviews = interview_repository
        self.scores = score_repository

    # ----- self service -----

    async def update_own_profile(self, current_user: dict[str, Any], payload: ProfileUpdateRequest) -> dict[str, Any]:
        provided = payload.model_fields_set
        role = current_user.get("role", ROLE_STUDENT)
        updates: dict[str, Any] = {}
        if "name" in provided and payload.name:
            updates["name"] = payload.name
        if "phone" in provided:
            updates["phone"] = payload.phone
        if "department" in provided and payload.department is not None:
            department = _department(payload.department)
            current_department = current_user.get("department")
            if role == ROLE_HOD and department != current_department:
                raise _forbidden("An operator assigns HOD departments.")
            if role == ROLE_STUDENT and current_department and department != current_department:
                raise _forbidden("Ask your HOD or an operator to change your department.")
            updates["department"] = department
        if "year" in provided and payload.year is not None:
            year = _year(payload.year)
            if role != ROLE_STUDENT:
                raise _invalid("Year applies to student accounts only.")
            current_year = current_user.get("year")
            if isinstance(current_year, int) and year != current_year:
                raise _forbidden("Ask your HOD or an operator to change your year.")
            updates["year"] = year
        if not updates:
            return current_user
        updated = await self.users.update_fields(current_user["id"], updates)
        if updated is None:
            raise _not_found()
        return serialize_user(updated)

    # ----- HOD -----

    def _hod_department(self, hod: dict[str, Any]) -> str:
        department = hod.get("department")
        if hod.get("role") != ROLE_HOD or not department:
            raise _forbidden("No department is assigned to this HOD account.")
        return department

    async def _department_student(self, hod: dict[str, Any], student_id: str) -> dict[str, Any]:
        department = self._hod_department(hod)
        student = await self.users.get_by_id(student_id)
        # Report "not found" for out-of-scope users so HODs cannot probe other departments.
        if student is None or user_role(student) != ROLE_STUDENT or student.get("department") != department:
            raise _not_found()
        return student

    async def list_department_students(self, hod: dict[str, Any], q: str | None, page: int, page_size: int) -> dict[str, Any]:
        department = self._hod_department(hod)
        query = {"$and": [STUDENT_ROLE_QUERY, {"department": department}]}
        return await self._paged_users(query, q, page, page_size, with_progress=True)

    async def department_student_progress(self, hod: dict[str, Any], student_id: str) -> dict[str, Any]:
        student = await self._department_student(hod, student_id)
        return await self._progress_detail(student)

    async def update_department_student(
        self, hod: dict[str, Any], student_id: str, payload: StaffStudentUpdateRequest
    ) -> dict[str, Any]:
        department = self._hod_department(hod)
        await self._department_student(hod, student_id)
        updates = self._staff_profile_updates(payload)
        if "department" in updates and updates["department"] != department:
            raise _forbidden("HODs cannot move students outside their department. Ask an operator.")
        return await self._apply_updates(student_id, updates)

    # ----- operator -----

    async def list_users(
        self, role: str | None, department: str | None, q: str | None, page: int, page_size: int
    ) -> dict[str, Any]:
        clauses: list[dict[str, Any]] = []
        if role == ROLE_STUDENT:
            clauses.append(STUDENT_ROLE_QUERY)
        elif role in {ROLE_HOD, ROLE_OPERATOR}:
            clauses.append({"role": role})
        elif role:
            raise _invalid("Unknown role filter.")
        if department:
            clauses.append({"department": _department(department)})
        query: dict[str, Any] = {"$and": clauses} if clauses else {}
        return await self._paged_users(query, q, page, page_size, with_progress=True)

    async def user_progress(self, user_id: str) -> dict[str, Any]:
        user = await self.users.get_by_id(user_id)
        if user is None:
            raise _not_found()
        return await self._progress_detail(user)

    async def update_user_profile(self, user_id: str, payload: StaffStudentUpdateRequest) -> dict[str, Any]:
        if await self.users.get_by_id(user_id) is None:
            raise _not_found()
        return await self._apply_updates(user_id, self._staff_profile_updates(payload))

    async def set_role(self, operator: dict[str, Any], user_id: str, payload: RoleUpdateRequest) -> dict[str, Any]:
        if operator.get("id") == user_id:
            raise _forbidden("Operators cannot change their own role.")
        target = await self.users.get_by_id(user_id)
        if target is None:
            raise _not_found()
        if not is_email_verified(target):
            raise _forbidden("Roles can only be assigned to verified accounts.")
        updates: dict[str, Any] = {"role": payload.role}
        if payload.role != ROLE_STUDENT:
            updates["year"] = None  # year of study applies to students only
        if payload.role == ROLE_HOD:
            updates["department"] = _department(payload.department or target.get("department"))
        elif payload.department:
            updates["department"] = _department(payload.department)
        return await self._apply_updates(user_id, updates)

    # ----- helpers -----

    def _staff_profile_updates(self, payload: StaffStudentUpdateRequest) -> dict[str, Any]:
        provided = payload.model_fields_set
        updates: dict[str, Any] = {}
        if "name" in provided and payload.name:
            updates["name"] = payload.name
        if "phone" in provided:
            updates["phone"] = payload.phone
        if "department" in provided and payload.department is not None:
            updates["department"] = _department(payload.department)
        if "year" in provided and payload.year is not None:
            updates["year"] = _year(payload.year)
        if not updates:
            raise _invalid("Provide at least one field to update.")
        return updates

    async def _apply_updates(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        updated = await self.users.update_fields(user_id, updates)
        if updated is None:
            raise _not_found()
        return serialize_user(updated)

    async def _paged_users(
        self, query: dict[str, Any], q: str | None, page: int, page_size: int, *, with_progress: bool
    ) -> dict[str, Any]:
        page = max(1, page)
        page_size = max(1, min(page_size, MAX_PAGE_SIZE))
        search = (q or "").strip()[:100]
        if search:
            pattern = {"$regex": re.escape(search), "$options": "i"}
            search_clause = {"$or": [{"name": pattern}, {"email": pattern}]}
            query = {"$and": [query, search_clause]} if query else search_clause
        total = await self.users.count(query)
        documents = await self.users.list_users(query, (page - 1) * page_size, page_size)
        users = [serialize_user(document) for document in documents]
        if with_progress:
            progress = await self._progress_by_user([user["id"] for user in users])
            for user in users:
                user["progress"] = progress.get(user["id"]) if user["role"] == ROLE_STUDENT else None
        return {"users": users, "total": total, "page": page, "page_size": page_size}

    async def _progress_by_user(self, user_ids: list[str]) -> dict[str, dict[str, Any]]:
        interviews = await self.interviews.list_progress_by_users(user_ids)
        scores = await self.scores.list_progress_by_users(user_ids)
        scores_by_interview = {score.get("interview_id"): score for score in scores}
        result: dict[str, dict[str, Any]] = {
            user_id: {"interviews_started": 0, "interviews_completed": 0, "average_score": None,
                      "latest_score": None, "latest_readiness": None, "last_activity_at": None}
            for user_id in user_ids
        }
        totals: dict[str, list[float]] = {user_id: [] for user_id in user_ids}
        for interview in interviews:  # newest first
            user_id = interview.get("user_id")
            if user_id not in result:
                continue
            entry = result[user_id]
            entry["interviews_started"] += 1
            activity = interview.get("completed_at") or interview.get("created_at")
            if activity and (entry["last_activity_at"] is None or activity > entry["last_activity_at"]):
                entry["last_activity_at"] = activity
            score = scores_by_interview.get(str(interview["_id"]))
            if interview.get("status") == "completed" and score is not None:
                entry["interviews_completed"] += 1
                summary = build_assessment_summary(score.get("overall_score", 0), score.get("question_scores", []))
                totals[user_id].append(summary["performance_score"])
                if entry["latest_score"] is None:
                    entry["latest_score"] = summary["performance_score"]
                    entry["latest_readiness"] = summary["readiness_category"]
        for user_id, values in totals.items():
            if values:
                result[user_id]["average_score"] = round(sum(values) / len(values), 1)
        return result

    async def _progress_detail(self, user: dict[str, Any]) -> dict[str, Any]:
        user_id = str(user["_id"])
        serialized = serialize_user(user)
        serialized["progress"] = (await self._progress_by_user([user_id]))[user_id]
        interviews = await self.interviews.list_progress_by_users([user_id])
        scores = {s.get("interview_id"): s for s in await self.scores.list_progress_by_users([user_id])}
        rows = []
        for interview in interviews:
            interview_id = str(interview["_id"])
            score = scores.get(interview_id)
            summary = (
                build_assessment_summary(score.get("overall_score", 0), score.get("question_scores", []))
                if score is not None else {}
            )
            rows.append({
                "id": interview_id,
                "status": interview.get("status", "active"),
                "created_at": interview.get("created_at"),
                "completed_at": interview.get("completed_at"),
                "question_count": len(interview.get("questions", [])),
                "performance_score": summary.get("performance_score"),
                "readiness_category": summary.get("readiness_category"),
                "completion_percentage": summary.get("completion_percentage", 0),
                "assessment_reliability": summary.get("assessment_reliability"),
                "difficulty": interview.get("difficulty") or {},
            })
        return {"student": serialized, "interviews": rows}
