from functools import lru_cache
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or backend/.env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = ""
    neon_auth_url: str = ""
    frontend_url: str = "http://localhost:5173"
    jwt_leeway_seconds: int = Field(default=120, ge=0)

    @property
    def jwks_url(self) -> str:
        base = self.neon_auth_url.strip().rstrip("/")
        return f"{base}/.well-known/jwks.json" if base else ""

    @property
    def jwt_issuer(self) -> str:
        base = self.neon_auth_url.strip().rstrip("/")
        if not base:
            return ""
        parsed = urlparse(base)
        return f"{parsed.scheme}://{parsed.netloc}"

    @property
    def allowed_issuers(self) -> set[str]:
        base = self.neon_auth_url.strip().rstrip("/")
        if not base:
            return set()
        return {self.jwt_issuer, base}

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.frontend_url.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
