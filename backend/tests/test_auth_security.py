from app.core import jwt
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

