"""Normalization and aggregation of locally derived webcam measurements.

The browser computes these values on the candidate's device. The API accepts only
bounded, derived numbers sent with explicit camera consent; it never receives or
stores video frames. Values are approximate framing/orientation signals, not
measures of confidence, honesty, emotion, or reliable eye contact.
"""
from __future__ import annotations

import math
from typing import Any

PERCENT_KEYS = (
    "face_visibility_pct",
    "centered_frame_pct",
    "head_movement_index",
    "gaze_toward_camera_pct",
    "posture_upright_pct",
)
ANGLE_KEYS = ("head_yaw_mean_deg", "head_pitch_mean_deg")
COUNT_KEYS = ("sample_count", "head_pose_samples", "gaze_samples", "posture_samples")
TIMELINE_KEYS = ("face", "centered", "movement", "gaze", "upright")
MAX_TIMELINE_POINTS = 60
MAX_SAMPLES = 100_000

SUMMARY_FIELDS = {
    "average_face_visibility_pct": "face_visibility_pct",
    "average_centered_frame_pct": "centered_frame_pct",
    "average_head_movement_index": "head_movement_index",
    "average_gaze_toward_camera_pct": "gaze_toward_camera_pct",
    "average_posture_upright_pct": "posture_upright_pct",
    "average_head_yaw_deg": "head_yaw_mean_deg",
    "average_head_pitch_deg": "head_pitch_mean_deg",
}


def _finite(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def normalize_webcam_metrics(metrics: Any) -> dict[str, Any]:
    """Keep only bounded derived numbers; drop everything without explicit consent."""
    if not isinstance(metrics, dict) or metrics.get("consent") is not True:
        return {}
    normalized: dict[str, Any] = {}
    for key in PERCENT_KEYS:
        number = _finite(metrics.get(key))
        if number is not None:
            normalized[key] = round(max(0.0, min(100.0, number)), 2)
    for key in ANGLE_KEYS:
        number = _finite(metrics.get(key))
        if number is not None:
            normalized[key] = round(max(-90.0, min(90.0, number)), 1)
    for key in COUNT_KEYS:
        value = metrics.get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            normalized[key] = max(0, min(value, MAX_SAMPLES))
    duration = _finite(metrics.get("duration_seconds"))
    if duration is not None:
        normalized["duration_seconds"] = round(max(0.0, min(7200.0, duration)), 1)
    timeline = metrics.get("timeline")
    if isinstance(timeline, list):
        points = []
        for point in timeline[:MAX_TIMELINE_POINTS]:
            if not isinstance(point, dict):
                continue
            t = _finite(point.get("t"))
            if t is None:
                continue
            row: dict[str, float | None] = {"t": round(max(0.0, min(7200.0, t)), 1)}
            for key in TIMELINE_KEYS:
                number = _finite(point.get(key))
                row[key] = None if number is None else round(max(0.0, min(100.0, number)), 1)
            points.append(row)
        if points:
            normalized["timeline"] = points
    if normalized.get("sample_count", 0) == 0:
        return {}
    normalized["consent"] = True
    # Derived values whose supporting samples are missing are not reported.
    if not normalized.get("gaze_samples"):
        normalized.pop("gaze_toward_camera_pct", None)
    if not normalized.get("posture_samples"):
        normalized.pop("posture_upright_pct", None)
    if not normalized.get("head_pose_samples"):
        normalized.pop("head_yaw_mean_deg", None)
        normalized.pop("head_pitch_mean_deg", None)
    return normalized


def summarize_webcam(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Average each signal over answers that actually measured it."""
    values: dict[str, list[float]] = {target: [] for target in SUMMARY_FIELDS}
    answers_with_metrics = 0
    total_samples = 0
    for row in rows:
        metrics = (row or {}).get("webcam_metrics") or {}
        had_metric = False
        for target, source in SUMMARY_FIELDS.items():
            number = _finite(metrics.get(source))
            if number is None:
                continue
            bound = 90.0 if source in ANGLE_KEYS else 100.0
            low = -90.0 if source in ANGLE_KEYS else 0.0
            values[target].append(max(low, min(bound, number)))
            had_metric = True
        if had_metric:
            answers_with_metrics += 1
            count = metrics.get("sample_count")
            if isinstance(count, int) and not isinstance(count, bool):
                total_samples += max(0, count)
    summary: dict[str, Any] = {
        key: round(sum(items) / len(items), 1) if items else None for key, items in values.items()
    }
    summary["answers_with_metrics"] = answers_with_metrics
    summary["total_samples"] = total_samples
    summary["measurement_note"] = (
        "Approximate on-device estimates from the webcam: face detection coverage, framing, head orientation "
        "and movement, an estimated gaze direction, and upper-body posture only when shoulders were visible. "
        "They depend on lighting, camera angle, and glasses, and do not measure confidence, honesty, emotion, "
        "or reliable eye contact."
    )
    return summary


def describe_webcam_summary(summary: dict[str, Any]) -> str:
    parts = []
    for key, label, suffix in (
        ("average_face_visibility_pct", "Face detected", "% of samples"),
        ("average_centered_frame_pct", "Face centered in frame", "% of samples"),
        ("average_head_movement_index", "Relative head movement index", " (0-100)"),
        ("average_gaze_toward_camera_pct", "Estimated gaze toward camera", "% of samples (approximate)"),
        ("average_posture_upright_pct", "Upright shoulders estimate", "% of samples with visible shoulders"),
    ):
        value = summary.get(key)
        if value is not None:
            parts.append(f"{label}: {float(value):.1f}{suffix}")
    if not parts:
        return "No camera measurements were recorded for this session (camera off, not consented, or not enough data)."
    return (
        f"Approximate on-device camera signals from {summary.get('answers_with_metrics', 0)} answer(s): "
        + "; ".join(parts)
        + ". These are framing and orientation estimates, not judgments of confidence, honesty, or emotion."
    )
