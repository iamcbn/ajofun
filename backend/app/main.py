from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import close_db_pool, init_db_pool
from app.routes.exchanges import router as exchanges_router
from app.routes.invites import router as invites_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db_pool()
    yield
    close_db_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Àjọfún API",
        version="0.1.0",
        description="Blind Anonymous Gifter matching and invite API backed by Neon PostgreSQL.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/api/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(invites_router)
    app.include_router(exchanges_router)
    return app


app = create_app()
