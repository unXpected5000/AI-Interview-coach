"""Bounded, in-memory sliding-window rate limits.

This is a single-process safeguard: state lives in this API process only, resets
on restart or sleep, and is not shared between instances. It bounds memory by
evicting the least recently used keys once ``max_keys`` is reached.
"""
from __future__ import annotations

import hashlib
import math
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from typing import Callable

from fastapi import HTTPException, Request, status

from app.core.config import settings


@dataclass(frozen=True)
class RateRule:
    scope: str
    limit: int
    window_seconds: int


class SlidingWindowLimiter:
    def __init__(self, max_keys: int = 20000, clock: Callable[[], float] = time.monotonic):
        self.max_keys = max_keys
        self.clock = clock
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()

    def hit(self, key: str, limit: int, window_seconds: int) -> float | None:
        """Record one attempt. Return seconds to wait when the limit is exceeded."""
        now = self.clock()
        bucket = self._hits.get(key)
        if bucket is None:
            bucket = deque()
            self._hits[key] = bucket
        else:
            self._hits.move_to_end(key)
        cutoff = now - window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return max(1.0, bucket[0] + window_seconds - now)
        bucket.append(now)
        while len(self._hits) > self.max_keys:
            self._hits.popitem(last=False)
        return None

    def reset(self) -> None:
        self._hits.clear()

    def __len__(self) -> int:
        return len(self._hits)


limiter = SlidingWindowLimiter(max_keys=settings.rate_limit_max_keys)

# Per-account/email limits are the primary control. Per-IP limits are generous
# because hosted proxies can make many users share one apparent address.
LOGIN_EMAIL = RateRule("login-email", 10, 15 * 60)
LOGIN_IP = RateRule("login-ip", 60, 15 * 60)
REGISTER_EMAIL = RateRule("register-email", 5, 60 * 60)
REGISTER_IP = RateRule("register-ip", 30, 60 * 60)
VERIFY_EMAIL = RateRule("verify-email", 10, 15 * 60)
VERIFY_IP = RateRule("verify-ip", 60, 15 * 60)
RESEND_EMAIL = RateRule("resend-email", 5, 60 * 60)
RESEND_IP = RateRule("resend-ip", 30, 60 * 60)
GOOGLE_IP = RateRule("google-ip", 60, 15 * 60)
INTERVIEW_START_USER = RateRule("interview-start", 10, 60 * 60)
INTERVIEW_ANSWER_USER = RateRule("interview-answer", 120, 60 * 60)
INTERVIEW_COMPLETE_USER = RateRule("interview-complete", 20, 60 * 60)
OPTIMIZER_USER = RateRule("optimizer", 10, 60 * 60)
UPLOAD_USER = RateRule("resume-upload", 20, 60 * 60)


def client_ip(request: Request | None) -> str:
    if request is None:
        return "unknown"
    header = settings.rate_limit_client_ip_header.strip().lower()
    if header:
        value = request.headers.get(header, "").split(",")[0].strip()
        if value:
            return value[:64]
    return request.client.host if request.client else "unknown"


def _key(rule: RateRule, identity: str) -> str:
    # Hash identities so the limiter never holds raw email addresses.
    digest = hashlib.sha256(identity.strip().lower().encode("utf-8")).hexdigest()[:32]
    return f"{rule.scope}:{digest}"


def enforce(rule: RateRule, identity: str) -> None:
    if not settings.rate_limit_enabled:
        return
    retry_after = limiter.hit(_key(rule, identity), rule.limit, rule.window_seconds)
    if retry_after is not None:
        seconds = int(math.ceil(retry_after))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Try again in about {seconds} seconds.",
            headers={"Retry-After": str(seconds)},
        )
