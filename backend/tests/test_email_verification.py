"""Email verification, legacy accounts, Google collisions, and operator bootstrap."""
import asyncio

import pytest

from app.core.config import settings
from app.core.security import hash_password
from app.repositories.user_repository import UserRepository
from app.schemas.auth_schema import RegisterRequest
from app.services import auth_service as auth_module
from app.services.auth_service import (
    AuthError,
    AuthService,
    EmailVerificationRequiredError,
    GoogleAccountConflictError,
    InvalidVerificationError,
)
from app.services.email_service import EmailNotConfiguredError, EmailService
from tests.fake_mongo import FakeDatabase

PASSWORD = "correct horse battery"


class RecordingEmail(EmailService):
    """Captures codes instead of sending mail. Never opens a network connection."""

    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    def ensure_available(self) -> None:
        return None

    async def send_verification_code(self, recipient: str, code: str, minutes: int) -> None:
        self.sent.append((recipient, code))


class Clock:
    def __init__(self, now: float = 1_000_000.0):
        self.now = now

    def __call__(self) -> float:
        return self.now


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-for-unit-tests")
    monkeypatch.setattr(settings, "operator_emails", "")
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "smtp_from_email", "")
    monkeypatch.setattr(settings, "email_dev_log_codes", False)


def make_service(clock=None):
    database = FakeDatabase()
    email = RecordingEmail()
    service = AuthService(UserRepository(database), email_service=email, clock=clock or Clock())
    return service, database, email


def register(service, email="student@example.com", password=PASSWORD):
    return asyncio.run(service.register("Student One", email, password, "Computer Science", 2))


def users(database):
    return database["users"].documents


def test_registration_requires_configured_email_delivery():
    service = AuthService(UserRepository(FakeDatabase()), email_service=EmailService())
    with pytest.raises(EmailNotConfiguredError):
        asyncio.run(service.register("Student", "a@example.com", PASSWORD, "Computer Science", 1))


def test_dev_code_logging_is_ignored_outside_development(monkeypatch):
    monkeypatch.setattr(settings, "email_dev_log_codes", True)
    monkeypatch.setattr(settings, "app_env", "production")
    with pytest.raises(EmailNotConfiguredError):
        EmailService().ensure_available()


def test_registration_issues_no_session_and_stores_only_a_code_hash():
    service, database, email = make_service()
    result = register(service)
    assert result["verification_required"] is True
    assert "access_token" not in result
    (stored,) = users(database)
    code = email.sent[-1][1]
    assert stored["email_verified"] is False
    assert stored["role"] == "student"
    assert code not in str(stored)
    assert len(stored["verification"]["code_hash"]) == 64


def test_unverified_password_account_cannot_sign_in_until_verified():
    service, database, email = make_service()
    register(service)
    with pytest.raises(EmailVerificationRequiredError):
        asyncio.run(service.login("student@example.com", PASSWORD))
    code = email.sent[-1][1]
    session = asyncio.run(service.verify_email("student@example.com", code, PASSWORD))
    assert session["access_token"]
    assert session["user"]["email_verified"] is True
    assert "verification" not in users(database)[0]
    assert asyncio.run(service.login("student@example.com", PASSWORD))["access_token"]


def test_verification_requires_matching_password_and_bounds_attempts(monkeypatch):
    monkeypatch.setattr(settings, "email_verification_max_attempts", 3)
    service, database, email = make_service()
    register(service)
    code = email.sent[-1][1]
    wrong = "000000" if code != "000000" else "111111"
    with pytest.raises(InvalidVerificationError):
        asyncio.run(service.verify_email("student@example.com", code, "not the password"))
    for _ in range(2):
        with pytest.raises(InvalidVerificationError):
            asyncio.run(service.verify_email("student@example.com", wrong, PASSWORD))
    # Attempts are exhausted, so even the correct code is now rejected.
    with pytest.raises(InvalidVerificationError):
        asyncio.run(service.verify_email("student@example.com", code, PASSWORD))
    assert users(database)[0]["email_verified"] is False


def test_expired_code_is_rejected():
    clock = Clock()
    service, _database, email = make_service(clock)
    register(service)
    code = email.sent[-1][1]
    clock.now += settings.email_verification_code_ttl_minutes * 60 + 1
    with pytest.raises(InvalidVerificationError):
        asyncio.run(service.verify_email("student@example.com", code, PASSWORD))


def test_resend_respects_cooldown_and_hourly_limit(monkeypatch):
    monkeypatch.setattr(settings, "email_verification_resend_cooldown_seconds", 60)
    monkeypatch.setattr(settings, "email_verification_max_sends_per_hour", 3)
    clock = Clock()
    service, _database, email = make_service(clock)
    register(service)
    asyncio.run(service.resend_verification("student@example.com"))
    assert len(email.sent) == 1  # within cooldown
    for _ in range(5):
        clock.now += 61
        asyncio.run(service.resend_verification("student@example.com"))
    assert len(email.sent) == 3  # hourly cap


def test_responses_do_not_reveal_whether_an_email_is_registered():
    service, database, email = make_service()
    register(service)
    asyncio.run(service.verify_email("student@example.com", email.sent[-1][1], PASSWORD))
    sent_before = len(email.sent)
    again = register(service)
    unknown = asyncio.run(service.resend_verification("nobody@example.com"))
    assert again == unknown == {"verification_required": True, "message": auth_module.PENDING_MESSAGE}
    assert len(email.sent) == sent_before
    assert len(users(database)) == 1


def test_reregistering_a_pending_address_cannot_activate_someone_elses_password():
    service, database, email = make_service()
    register(service, password="victim password 1")
    victim_code = email.sent[-1][1]
    register(service, password="attacker password")  # within cooldown: no new code
    with pytest.raises(InvalidVerificationError):
        asyncio.run(service.verify_email("student@example.com", victim_code, "victim password 1"))
    with pytest.raises(InvalidVerificationError):
        asyncio.run(service.verify_email("student@example.com", "123456", "attacker password"))


def test_legacy_password_account_must_verify_on_next_sign_in():
    service, database, email = make_service()
    asyncio.run(database["users"].insert_one({
        "name": "Legacy", "email": "legacy@example.com", "password_hash": hash_password(PASSWORD),
        "google_id": None, "created_at": 1, "updated_at": 1,
    }))
    legacy_id = str(users(database)[0]["_id"])
    assert asyncio.run(service.get_user_by_id(legacy_id)) is None  # old tokens stop working
    with pytest.raises(EmailVerificationRequiredError):
        asyncio.run(service.login("legacy@example.com", PASSWORD))
    assert email.sent and email.sent[-1][0] == "legacy@example.com"
    with pytest.raises(AuthError):
        asyncio.run(service.login("legacy@example.com", "wrong password"))


def google_identity(email="victim@gmail.com", google_id="google-sub-1", authoritative=True):
    return {"google_id": google_id, "email": email, "name": "Victim", "email_authoritative": authoritative}


def test_google_sign_in_evicts_password_from_unverified_preregistration():
    service, database, _email = make_service()
    register(service, email="victim@gmail.com", password="attacker password")
    session = asyncio.run(service.login_with_google(google_identity()))
    stored = users(database)[0]
    assert stored["password_hash"] is None
    assert stored["email_verified"] is True
    assert stored["department"] is None and stored["name"] == "Victim"
    assert session["user"]["profile_complete"] is False
    with pytest.raises(AuthError):
        asyncio.run(service.login("victim@gmail.com", "attacker password"))


def test_google_sign_in_removes_unverified_password_from_previously_linked_legacy_account():
    service, database, _email = make_service()
    asyncio.run(database["users"].insert_one({
        "name": "Legacy", "email": "victim@gmail.com", "password_hash": hash_password("attacker password"),
        "google_id": "google-sub-1", "created_at": 1, "updated_at": 1,
    }))
    asyncio.run(service.login_with_google(google_identity()))
    assert users(database)[0]["password_hash"] is None
    with pytest.raises(AuthError):
        asyncio.run(service.login("victim@gmail.com", "attacker password"))


def test_google_links_verified_password_account_and_keeps_password():
    service, database, email = make_service()
    register(service, email="owner@gmail.com")
    asyncio.run(service.verify_email("owner@gmail.com", email.sent[-1][1], PASSWORD))
    asyncio.run(service.login_with_google(google_identity(email="owner@gmail.com")))
    stored = users(database)[0]
    assert stored["google_id"] == "google-sub-1" and stored["password_hash"]
    assert asyncio.run(service.login("owner@gmail.com", PASSWORD))["access_token"]


def test_non_authoritative_google_email_cannot_take_over_existing_account():
    service, _database, _email = make_service()
    register(service, email="person@example.org")
    with pytest.raises(GoogleAccountConflictError):
        asyncio.run(service.login_with_google(google_identity(email="person@example.org", authoritative=False)))


def test_operator_bootstrap_requires_configured_verified_address(monkeypatch):
    monkeypatch.setattr(settings, "operator_emails", "admin@example.com, other@example.com")
    service, database, email = make_service()
    register(service, email="admin@example.com")
    assert users(database)[0]["role"] == "student"
    session = asyncio.run(service.verify_email("admin@example.com", email.sent[-1][1], PASSWORD))
    assert session["user"]["role"] == "operator"
    register(service, email="student@example.com")
    assert users(database)[1]["role"] == "student"


def test_registration_payload_cannot_choose_a_role():
    payload = RegisterRequest.model_validate({
        "name": "Student", "email": "s@example.com", "password": PASSWORD,
        "department": "Computer Science", "year": 1, "role": "operator",
    })
    assert not hasattr(payload, "role")
    service, database, _email = make_service()
    asyncio.run(service.register(payload.name, str(payload.email), payload.password, payload.department, payload.year))
    assert users(database)[0]["role"] == "student"


def test_registration_rejects_unknown_department_and_year():
    service, database, _email = make_service()
    with pytest.raises(auth_module.ProfileValidationError):
        asyncio.run(service.register("Student", "x@example.com", PASSWORD, "Astrology", 1))
    with pytest.raises(auth_module.ProfileValidationError):
        asyncio.run(service.register("Student", "x@example.com", PASSWORD, "Computer Science", 99))
    assert users(database) == []
