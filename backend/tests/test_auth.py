import time
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import HTTPException
import jwt
from jwt.exceptions import PyJWKClientConnectionError

from app import auth
from app.config import Settings


@pytest.fixture()
def eddsa_auth_env(monkeypatch: pytest.MonkeyPatch):
    """Stub JWKS resolution and Settings so verify_neon_jwt runs deterministically offline."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    auth_url = "https://example.neonauth.test/neondb/auth"
    settings = Settings(neon_auth_url=auth_url)

    class StubJwkClient:
        def get_signing_key_from_jwt(self, _token: str) -> SimpleNamespace:
            return SimpleNamespace(key=public_key)

    monkeypatch.setattr(auth, "get_settings", lambda: settings)
    monkeypatch.setattr(auth, "_get_jwk_client", lambda _jwks_url: StubJwkClient())

    def issue_token(overrides: dict | None = None) -> str:
        now = int(time.time())
        payload = {
            "sub": "user-123",
            "email": "joiner@example.com",
            "name": "Joiner",
            "iss": "https://example.neonauth.test",
            "iat": now,
            "exp": now + 900,
        }
        if overrides:
            payload.update(overrides)
        return jwt.encode(
            payload,
            private_key,
            algorithm="EdDSA",
            headers={"kid": "test-kid"},
        )

    return issue_token


def test_verify_neon_jwt_accepts_valid_token(eddsa_auth_env) -> None:
    token = eddsa_auth_env()
    user = auth.verify_neon_jwt(token)
    assert user.user_id == "user-123"
    assert user.email == "joiner@example.com"
    assert user.name == "Joiner"


def test_verify_neon_jwt_accepts_clock_skew_within_leeway(eddsa_auth_env) -> None:
    now = int(time.time())
    token = eddsa_auth_env({"iat": now + 45, "exp": now + 945})
    user = auth.verify_neon_jwt(token)
    assert user.user_id == "user-123"


def test_verify_neon_jwt_rejects_future_iat_beyond_leeway(eddsa_auth_env) -> None:
    now = int(time.time())
    token = eddsa_auth_env({"iat": now + 300, "exp": now + 1200})
    with pytest.raises(HTTPException) as exc_info:
        auth.verify_neon_jwt(token)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid or expired authentication token."


def test_verify_neon_jwt_rejects_expired_token_beyond_leeway(eddsa_auth_env) -> None:
    now = int(time.time())
    token = eddsa_auth_env({"iat": now - 1200, "exp": now - 300})
    with pytest.raises(HTTPException) as exc_info:
        auth.verify_neon_jwt(token)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid or expired authentication token."


def test_verify_neon_jwt_rejects_mismatched_issuer(eddsa_auth_env) -> None:
    token = eddsa_auth_env({"iss": "https://other.example.com"})
    with pytest.raises(HTTPException) as exc_info:
        auth.verify_neon_jwt(token)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Token issuer does not match NEON_AUTH_URL."


def test_verify_neon_jwt_returns_503_on_jwks_connection_error(
    monkeypatch: pytest.MonkeyPatch,
    eddsa_auth_env,
) -> None:
    class FailingJwkClient:
        def get_signing_key_from_jwt(self, _token: str) -> SimpleNamespace:
            raise PyJWKClientConnectionError("network unreachable")

    monkeypatch.setattr(auth, "_get_jwk_client", lambda _jwks_url: FailingJwkClient())
    token = eddsa_auth_env()
    with pytest.raises(HTTPException) as exc_info:
        auth.verify_neon_jwt(token)
    assert exc_info.value.status_code == 503
