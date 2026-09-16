# core/database.py
# ============================================================
# SQLAlchemy connection layout.
# We use two engine styles:
#   1. AsyncEngine — used by FastAPI route handlers
#   2. SyncEngine  — used by Celery workers
# ============================================================

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from core.config import settings

# ── Engines ──────────────────────────────────────────────────

async_engine = create_async_engine(
    settings.database_url, 
    echo=False, 
    pool_pre_ping=True, 
    pool_recycle=300
)
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Dynamically create the sync URL from the async one to ensure Celery works
_sync_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
if "ssl=require" in _sync_url:
    _sync_url = _sync_url.replace("ssl=require", "sslmode=require")

sync_engine = create_engine(
    _sync_url, 
    echo=False, 
    pool_pre_ping=True, 
    pool_recycle=300
)
SyncSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

# ── Initialisation ───────────────────────────────────────────

def init_db_sync() -> None:
    """
    Create tables if they don't exist (sync init).
    """
    from core.models import Base
    Base.metadata.create_all(bind=sync_engine)

# ── Async helpers (FastAPI) ──────────────────────────────────

async def get_async_db():
    """
    Async context-manager style dependency for FastAPI routes.
    """
    async with AsyncSessionLocal() as session:
        yield session

# ── Sync helpers (Celery workers) ────────────────────────────

def get_sync_db():
    """
    Return a sync session for Celery tasks.
    """
    return SyncSessionLocal()

