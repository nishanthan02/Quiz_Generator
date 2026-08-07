# main.py
# ============================================================
# FastAPI application factory and route registration.
#
# This is the entry point for the web server process.
# Run with:
#   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
#
# Architecture note:
#   main.py is intentionally thin.  Its only responsibilities
#   are:
#     1. Create the FastAPI app instance.
#     2. Register routers (each router owns its own URL prefix).
#     3. Run one-time startup hooks (DB init, Qdrant collection).
#     4. Expose a health-check endpoint.
#
#   ALL business logic lives in services/ and workers/.
#   ALL route handlers live in routers/.
# ============================================================

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.database import init_db_sync
from core.qdrant_setup import ensure_collection_exists
from routers import auth_router, management, learning


# ── Lifespan (startup / shutdown hooks) ─────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Code before `yield` runs at startup.
    Code after `yield` runs at shutdown.
    Using the modern lifespan approach (replaces @app.on_event).
    """
    # ── Startup ──────────────────────────────────────────
    print("[Startup] Initialising SQLite schema...")
    init_db_sync()

    print("[Startup] Ensuring Qdrant collection exists...")
    ensure_collection_exists()

    print(f"[Startup] App environment: {settings.app_env}")
    print("[Startup] Ready to accept requests.")

    yield  # ← application runs here

    # ── Shutdown ──────────────────────────────────────────
    print("[Shutdown] Cleaning up resources...")
    # Qdrant and MinIO clients manage their own connection pools.
    # Nothing explicit needed here for SQLite (connections are
    # per-request and closed automatically).


# ── App factory ──────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title="Dynamic Quiz Generator API",
        description=(
            "EdTech API for Moodle plugins. Upload course materials, "
            "process them into vector embeddings, and generate massive "
            "anti-cheat quiz variant sets using an Agentic AI workflow."
        ),
        version="1.0.0",
        lifespan=lifespan,
        # Disable docs in production for security
        docs_url="/docs" if settings.app_env != "production" else None,
        redoc_url="/redoc" if settings.app_env != "production" else None,
    )

    # ── CORS ──────────────────────────────────────────────
    # Allow all origins for now to ensure the Vercel frontend can connect.
    # In a strict production environment, replace ["*"] with your Vercel URL.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────
    # Each router handles a distinct domain of the application.
    # Prefixes are defined inside each router file.
    app.include_router(auth_router.router)
    app.include_router(management.router)
    app.include_router(learning.router)

    return app


app = create_app()


# ── Health check ─────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check():
    """
    Lightweight liveness probe.
    Load balancers and Kubernetes probes should call this endpoint.
    Returns 200 as long as the FastAPI process is alive.
    For a deeper readiness probe, add Qdrant/Redis connectivity checks.
    """
    return {
        "status": "ok",
        "environment": settings.app_env,
        "version": "1.0.0",
    }
