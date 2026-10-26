from app.core import jwt
from app.core.google_identity import (
    GoogleIdentityError,
    GoogleIdentityVerificationUnavailable,
    normalize_google_claims,
    verify_google_id_token,
)
from app.core.security import hash_password, verify_password


def test_google_token_verifier_transport_dependency_is_installed() -> None:
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token

    assert Request is not None
    assert id_token.verify_oauth2_token is not None


def test_hash_password_does_not_store_plain_text() -> None:
    password = "strong-password"

    password_hash = hash_password(password)

    assert password_hash != password
    assert verify_password(password, password_hash)
    assert not verify_password("wrong-password", password_hash)


def test_access_token_round_trip(monkeypatch) -> None:
    monkeypatch.setattr(jwt.settings, "jwt_secret_key", "test-secret")

    token = jwt.create_access_token("user-id")

    assert jwt.decode_access_token(token) == "user-id"


def test_google_identity_accepts_verified_google_claims_and_normalizes_email() -> None:
    identity = normalize_google_claims(
        {
            "iss": "https://accounts.google.com",
            "sub": "google-subject-id",
            "email": "Candidate@Example.com",
            "email_verified": True,
            "name": "Candidate",
        }
    )

    assert identity == {
        "google_id": "google-subject-id",
        "email": "candidate@example.com",
        "name": "Candidate",
        "email_authoritative": False,
    }


def test_google_identity_marks_gmail_as_authoritative() -> None:
    identity = normalize_google_claims(
        {
            "iss": "accounts.google.com",
            "sub": "google-subject-id",
            "email": "candidate@gmail.com",
            "email_verified": True,
        }
    )
    assert identity["email_authoritative"] is True


def test_google_identity_marks_verified_workspace_domain_as_authoritative() -> None:
    identity = normalize_google_claims(
        {
            "iss": "accounts.google.com",
            "sub": "google-subject-id",
            "email": "candidate@company.example",
            "email_verified": True,
            "hd": "company.example",
        }
    )
    assert identity["email_authoritative"] is True


def test_google_identity_rejects_unverified_email() -> None:
    try:
        normalize_google_claims(
            {
                "iss": "accounts.google.com",
                "sub": "google-subject-id",
                "email": "candidate@example.com",
                "email_verified": False,
            }
        )
    except GoogleIdentityError as exc:
        assert "verify" in str(exc).lower()
    else:
        raise AssertionError("Unverified Google email should not be accepted")


def test_google_identity_rejects_non_google_issuer() -> None:
    try:
        normalize_google_claims(
            {
                "iss": "https://attacker.example",
                "sub": "google-subject-id",
                "email": "candidate@example.com",
                "email_verified": True,
            }
        )
    except GoogleIdentityError as exc:
        assert "issuer" in str(exc).lower()
    else:
        raise AssertionError("Non-Google issuer should not be accepted")


def _mock_google_token_verifier(monkeypatch, verifier):
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    timeouts = []

    class FakeRequest:
        def __call__(self, url, method="GET", body=None, headers=None, timeout=120, **kwargs):
            timeouts.append(timeout)
            return object()

    monkeypatch.setattr(google_requests, "Request", FakeRequest)
    monkeypatch.setattr(id_token, "verify_oauth2_token", verifier)
    return timeouts


def test_google_token_verification_uses_expected_audience_and_bounded_request_timeout(monkeypatch) -> None:
    claims = {
        "iss": "https://accounts.google.com",
        "sub": "subject-123",
        "email": "candidate@gmail.com",
        "email_verified": True,
        "name": "Candidate",
    }
    observed = {}

    def verify(token, request, audience):
        observed["token"] = token
        observed["audience"] = audience
        request("https://www.googleapis.com/oauth2/v1/certs")
        return claims

    timeouts = _mock_google_token_verifier(monkeypatch, verify)

    identity = verify_google_id_token("mock-id-token", "web-client-id")

    assert identity["google_id"] == "subject-123"
    assert observed == {"token": "mock-id-token", "audience": "web-client-id"}
    assert timeouts == [5]


def test_google_token_verification_rejects_invalid_and_expired_tokens(monkeypatch) -> None:
    import pytest

    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    class FakeRequest:
        def __call__(self, *args, **kwargs):
            return object()

    monkeypatch.setattr(google_requests, "Request", FakeRequest)
    for failure_message in ("invalid signature", "token is expired"):
        def reject_token(*args, **kwargs):
            raise ValueError(failure_message)

        monkeypatch.setattr(id_token, "verify_oauth2_token", reject_token)
        with pytest.raises(GoogleIdentityError):
            verify_google_id_token("rejected-token", "web-client-id")


def test_google_token_verification_reports_network_failure_as_temporary(monkeypatch) -> None:
    import pytest

    from google.auth.exceptions import TransportError
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    class FakeRequest:
        def __call__(self, *args, **kwargs):
            return object()

    monkeypatch.setattr(google_requests, "Request", FakeRequest)
    monkeypatch.setattr(
        id_token,
        "verify_oauth2_token",
        lambda *args, **kwargs: (_ for _ in ()).throw(TransportError("certificate fetch timed out")),
    )

    with pytest.raises(GoogleIdentityVerificationUnavailable):
        verify_google_id_token("valid-shaped-token", "web-client-id")


def test_google_auth_route_maps_verification_failures_to_http_status(monkeypatch) -> None:
    import pytest
    from fastapi import HTTPException

    from app.api.routes import auth as auth_routes
    from app.core.google_identity import GoogleIdentityVerificationUnavailable
    from app.schemas.auth_schema import GoogleLoginRequest

    class UnusedAuthService:
        pass

    monkeypatch.setattr(auth_routes.settings, "google_client_id", "web-client-id")

    async def run_in_thread_inline(function, *args):
        return function(*args)

    monkeypatch.setattr(auth_routes.asyncio, "to_thread", run_in_thread_inline)

    async def call_route():
        return await auth_routes.google_login(
            GoogleLoginRequest(credential="x" * 40),
            UnusedAuthService(),
        )

    def run_immediate(coroutine):
        try:
            coroutine.send(None)
        except StopIteration as completed:
            return completed.value
        raise AssertionError("The mocked verification unexpectedly performed asynchronous I/O")

    monkeypatch.setattr(
        auth_routes,
        "verify_google_id_token",
        lambda *_args: (_ for _ in ()).throw(GoogleIdentityVerificationUnavailable("network")),
    )
    with pytest.raises(HTTPException) as network_error:
        run_immediate(call_route())
    assert network_error.value.status_code == 503
    assert network_error.value.headers["Retry-After"] == "2"

    monkeypatch.setattr(
        auth_routes,
        "verify_google_id_token",
        lambda *_args: (_ for _ in ()).throw(GoogleIdentityError("invalid token")),
    )
    with pytest.raises(HTTPException) as credential_error:
        run_immediate(call_route())
    assert credential_error.value.status_code == 401
