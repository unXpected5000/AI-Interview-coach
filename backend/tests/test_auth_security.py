from app.core import jwt
from app.core.google_identity import GoogleIdentityError, normalize_google_claims
from app.core.security import hash_password, verify_password


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
