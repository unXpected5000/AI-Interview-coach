from __future__ import annotations

from functools import partial
from typing import Any


class GoogleIdentityError(ValueError):
    """The supplied Google credential is invalid or lacks a verified email."""


class GoogleIdentityNotConfigured(RuntimeError):
    """The web client ID or verification dependency is not configured."""


class GoogleIdentityVerificationUnavailable(RuntimeError):
    """Google's verification certificates could not be fetched temporarily."""


def normalize_google_claims(claims: dict[str, Any]) -> dict[str, Any]:
    issuer = claims.get("iss")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise GoogleIdentityError("Google credential issuer is invalid.")

    google_id = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    if not google_id or len(google_id) > 255:
        raise GoogleIdentityError("Google credential does not contain a valid account ID.")
    if claims.get("email_verified") is not True:
        raise GoogleIdentityError("Google must verify the account email before sign-in.")
    if len(email) > 254 or "@" not in email:
        raise GoogleIdentityError("Google credential does not contain a valid email address.")

    name = str(claims.get("name") or email.split("@", 1)[0]).strip()
    name = name[:100] or email.split("@", 1)[0][:100]
    # Google documents Gmail addresses and verified Workspace domains as authoritative.
    # For other Google Accounts, email_verified alone may not prove current ownership.
    return {
        "google_id": google_id,
        "email": email,
        "name": name,
        "email_authoritative": email.endswith("@gmail.com") or bool(claims.get("hd")),
    }


def verify_google_id_token(credential: str, client_id: str) -> dict[str, Any]:
    if not client_id.strip():
        raise GoogleIdentityNotConfigured("Google sign-in is not configured on this server.")

    try:
        from google.auth.exceptions import GoogleAuthError, TransportError
        from google.auth.transport.requests import Request
        from google.oauth2 import id_token
    except ImportError as exc:
        raise GoogleIdentityNotConfigured("Google sign-in verification dependency is missing.") from exc

    try:
        # google-auth Request accepts the timeout on each call, not in its
        # constructor. verify_oauth2_token invokes this callable for cert fetches.
        request = partial(Request(), timeout=5)
        claims = id_token.verify_oauth2_token(credential, request, client_id)
    except TransportError as exc:
        raise GoogleIdentityVerificationUnavailable(
            "Google's verification service is temporarily unreachable. Try again shortly."
        ) from exc
    except (GoogleAuthError, ValueError) as exc:
        raise GoogleIdentityError("Google credential could not be verified.") from exc

    return normalize_google_claims(claims)
