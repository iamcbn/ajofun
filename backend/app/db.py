import ssl
from collections.abc import Callable, Generator, Iterable
from contextlib import AbstractContextManager, contextmanager
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse
from uuid import UUID

import pg8000.dbapi
from fastapi import HTTPException, status

from app.config import get_settings

_db_config: dict[str, Any] | None = None


def parse_database_url(url: str) -> dict[str, Any]:
    """Parse a PostgreSQL connection URL into pg8000.dbapi.connect keyword arguments."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("DATABASE_URL must begin with postgresql:// or postgres://.")

    host = parsed.hostname
    database = parsed.path.lstrip("/")
    if not host or not database:
        raise ValueError("DATABASE_URL must include both a host and database name.")

    query = parse_qs(parsed.query)
    sslmode = (query.get("sslmode", ["require"])[0] or "require").lower()

    kwargs: dict[str, Any] = {
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "host": host,
        "port": parsed.port or 5432,
        "database": database,
    }
    if sslmode != "disable":
        kwargs["ssl_context"] = ssl.create_default_context()
    return kwargs


def _normalize_param(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    return value


def _normalize_params(params: Iterable[Any]) -> tuple[Any, ...]:
    return tuple(_normalize_param(value) for value in params)


class DictCursor:
    """Context-managed pg8000 cursor returning dictionaries keyed by column name."""

    def __init__(self, cursor: pg8000.dbapi.Cursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> "DictCursor":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self._cursor.close()

    def execute(self, query: str, params: Iterable[Any] = ()) -> None:
        self._cursor.execute(query, _normalize_params(params))

    def executemany(self, query: str, params_seq: Iterable[Iterable[Any]]) -> None:
        normalized_seq = [_normalize_params(row) for row in params_seq]
        self._cursor.executemany(query, normalized_seq)

    def _row_to_dict(self, row: tuple[Any, ...]) -> dict[str, Any]:
        columns = [col[0] for col in (self._cursor.description or ())]
        return dict(zip(columns, row))

    def fetchone(self) -> dict[str, Any] | None:
        row = self._cursor.fetchone()
        if row is None:
            return None
        return self._row_to_dict(row)

    def fetchall(self) -> list[dict[str, Any]]:
        rows = self._cursor.fetchall()
        return [self._row_to_dict(row) for row in rows]


class DbConnection:
    """Thin transactional wrapper over a pg8000.dbapi connection."""

    def __init__(self, conn: pg8000.dbapi.Connection) -> None:
        self._conn = conn
        self._conn.autocommit = False

    def cursor(self) -> DictCursor:
        return DictCursor(self._conn.cursor())

    @contextmanager
    def transaction(self) -> Generator[None, None, None]:
        try:
            yield
            self._conn.commit()
        except Exception:
            self._conn.rollback()
            raise

    def close(self) -> None:
        self._conn.close()


def init_db_pool() -> None:
    """Validate and cache DATABASE_URL connection arguments on startup if configured."""
    global _db_config
    settings = get_settings()
    raw_url = settings.database_url.strip()
    if not raw_url:
        _db_config = None
        return
    _db_config = parse_database_url(raw_url)


def close_db_pool() -> None:
    """Clear cached connection settings during shutdown."""
    global _db_config
    _db_config = None


@contextmanager
def db_session() -> Generator[DbConnection, None, None]:
    """Open a short-lived TLS pg8000 connection to Neon and always close it."""
    global _db_config
    if _db_config is None:
        init_db_pool()
    if _db_config is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not configured. Set DATABASE_URL in backend/.env.",
        )

    raw_conn = pg8000.dbapi.connect(**_db_config)
    conn = DbConnection(raw_conn)
    try:
        yield conn
    finally:
        conn.close()


def get_db() -> Generator[DbConnection, None, None]:
    """FastAPI dependency opening a per-request TLS pg8000 connection to Neon."""
    with db_session() as conn:
        yield conn


def get_db_session_factory() -> Callable[[], AbstractContextManager[DbConnection]]:
    """FastAPI dependency returning a context-managed DB session factory for streaming routes."""
    return db_session
