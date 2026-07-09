# core/config.py
# ============================================================
# Centralised application configuration via Pydantic Settings.
# All values are read from environment variables (or the .env
# file in the project root).  Import `settings` anywhere in
# the app — never read os.environ directly in business code.
# ============================================================

from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    """
    All configuration is declared here with types and defaults.
    Pydantic will raise a clear error at startup if a required
    variable is missing, preventing silent misconfigurations.
    """

    # --- Gemini AI ---
    gemini_api_key: str
    gemini_model: str = "gemini-1.5-flash"

    # --- Additional Models ---
    github_token: str | None = None
    cohere_api_key: str | None = None
    groq_api_key: str | None = None

    # --- Redis / Celery ---
    redis_url: str = "redis://localhost:6379/0"

    # --- Qdrant ---
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_url: str | None = None
    qdrant_api_key: str | None = None
    qdrant_collection_name: str = "course_chunks"

    # --- MinIO ---
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket_documents: str = "course-documents"
    minio_bucket_quizzes: str = "generated-quizzes"
    minio_use_ssl: bool = False

    # --- PostgreSQL ---
    database_url: str = "postgresql+asyncpg://postgres:nish%402006@localhost:5432/quiz_app"
    sync_database_url: str = "postgresql+psycopg2://postgres:nish%402006@localhost:5432/quiz_app"

    # --- JWT Authentication ---
    jwt_secret_key: str = "super_secret_key_change_in_production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440 # 24 hours

    # --- App General ---
    app_env: str = "development"
    log_level: str = "INFO"
    sqlite_db_path: str = "./quiz_app.db"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache()
def get_settings() -> Settings:
    """
    Return a cached singleton of Settings.
    Using @lru_cache means the .env file is parsed exactly once
    per process, not on every function call.
    """
    return Settings()


# Convenience alias — most modules can just do:
#   from core.config import settings
settings = get_settings()
