"""Authenticated account export and permanent deletion endpoints."""
from typing import Annotated

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse, Response

from app.api.deps import get_current_user
from app.db.mongodb import get_database
from app.utils.mongo import make_json_safe

router = APIRouter(prefix="/account", tags=["account"])

COLLECTIONS = ("users", "resumes", "interviews", "answers", "scores", "resume_optimizations")


@router.get("/export")
async def export_account_data(current_user: Annotated[dict, Depends(get_current_user)]) -> JSONResponse:
    """Return only records owned by the authenticated account; omit credentials."""
    database = get_database()
    uid = current_user["id"]
    user = await database.users.find_one({"_id": __import__("bson").ObjectId(uid)})
    if user:
        user.pop("password_hash", None)
    data = {"account": user, "excluded": ["password hashes and authentication secrets"], "collections": {}}
    for name in COLLECTIONS[1:]:
        rows = await database[name].find({"user_id": uid}).to_list(length=None)
        data["collections"][name] = rows
    return JSONResponse(make_json_safe(data), headers={"Content-Disposition": 'attachment; filename="ai-interview-coach-data.json"'})


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(current_user: Annotated[dict, Depends(get_current_user)]) -> Response:
    """Permanently erase user-owned app data and then remove the account."""
    database = get_database()
    uid = current_user["id"]
    interview_ids = [str(row["_id"]) for row in await database.interviews.find({"user_id": uid}, {"_id": 1}).to_list(length=None)]
    # Delete dependent collections before the identity record. Any database error
    # leaves the identity in place so a retry remains possible.
    for name in ("answers", "scores", "resume_optimizations", "interviews", "resumes"):
        await database[name].delete_many({"user_id": uid})
    # Historical records may not carry user_id consistently; constrain by owned IDs.
    if interview_ids:
        await database.answers.delete_many({"interview_id": {"$in": interview_ids}})
        await database.scores.delete_many({"interview_id": {"$in": interview_ids}})
    result = await database.users.delete_one({"_id": __import__("bson").ObjectId(uid)})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Account was not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/consent")
async def get_consent_history(current_user: Annotated[dict, Depends(get_current_user)]) -> JSONResponse:
    user = await get_database().users.find_one({"_id": ObjectId(current_user["id"])}, {"consent_preferences": 1, "consent_history": 1})
    return JSONResponse(make_json_safe({"preferences": (user or {}).get("consent_preferences", {}), "history": (user or {}).get("consent_history", [])}))


@router.put("/consent")
async def update_consent(payload: dict, current_user: Annotated[dict, Depends(get_current_user)]) -> JSONResponse:
    consent_type = payload.get("type")
    action = payload.get("action")
    if consent_type not in {"cookie_preferences", "ai_processing", "microphone_processing", "terms_acknowledgement"}:
        raise HTTPException(status_code=422, detail="Unknown consent type.")
    if action not in {"accepted", "rejected", "withdrawn", "updated"}:
        raise HTTPException(status_code=422, detail="Invalid consent action.")
    event = {"type": consent_type, "action": action, "policy_version": str(payload.get("policy_version", "2026-10"))[:40], "timestamp": datetime.now(timezone.utc), "preferences": payload.get("preferences", {}) if consent_type == "cookie_preferences" else {}}
    updates = {"$push": {"consent_history": {"$each": [event], "$slice": -100}}, "$set": {"updated_at": datetime.now(timezone.utc)}}
    if consent_type == "cookie_preferences":
        prefs = event["preferences"]
        if not isinstance(prefs, dict) or any(key not in {"essential", "analytics", "marketing"} for key in prefs):
            raise HTTPException(status_code=422, detail="Invalid cookie preference values.")
        normalized = {"essential": True, "analytics": bool(prefs.get("analytics", False)), "marketing": bool(prefs.get("marketing", False))}
        event["preferences"] = normalized
        updates["$set"]["consent_preferences"] = normalized
    await get_database().users.update_one({"_id": ObjectId(current_user["id"])}, updates)
    return JSONResponse(make_json_safe({"saved": True, "event": event}))
