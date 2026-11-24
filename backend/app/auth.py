import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient, PyJWTError
from jwt.exceptions import PyJWKClientConnectionError

from app.config import get_settings

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    email: str | None = None
    name: str | None = None
    email_verified: bool = True


@lru_cache(maxsize=4)
def _get_jwk_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url, cache_keys=True)


def verify_neon_jwt(token: str) -> AuthenticatedUser:
    """Validate a Neon Auth JWT against the branch JWKS endpoint."""
    settings = get_settings()
    if not settings.jwks_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="NEON_AUTH_URL is not configured on the backend.",
        )

    options: dict[str, Any] = {"verify_aud": False, "require": ["sub", "exp"]}
    if settings.allowed_issuers:
        options["require"].append("iss")

    try:
        jwk_client = _get_jwk_client(settings.jwks_url)
        signing_key = jwk_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["EdDSA", "RS256", "ES256"],
            leeway=settings.jwt_leeway_seconds,
            options=options,
        )
    except PyJWKClientConnectionError as exc:
        logger.warning("Unable to reach Neon Auth JWKS endpoint: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to reach authentication service to verify your session.",
        ) from exc
    except PyJWTError as exc:
        logger.warning("Neon JWT verification failed (%s): %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    issuer = payload.get("iss")
    if issuer and settings.allowed_issuers and issuer.rstrip("/") not in settings.allowed_issuers:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token issuer does not match NEON_AUTH_URL.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    aud = payload.get("aud")
    if aud is not None and settings.allowed_issuers:
        aud_values = [aud] if isinstance(aud, str) else list(aud) if isinstance(aud, list) else []
        if not any(
            isinstance(entry, str) and entry.rstrip("/") in settings.allowed_issuers
            for entry in aud_values
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token audience does not match NEON_AUTH_URL.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing valid subject claim.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email_verified = payload.get("email_verified")
    if email_verified is None:
        email_verified = payload.get("emailVerified", True)

    return AuthenticatedUser(
        user_id=sub,
        email=payload.get("email") if isinstance(payload.get("email"), str) else None,
        name=payload.get("name") if isinstance(payload.get("name"), str) else None,
        email_verified=bool(email_verified),
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthenticatedUser:
    """FastAPI dependency requiring a valid Bearer JWT from Neon Auth."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_neon_jwt(credentials.credentials)
