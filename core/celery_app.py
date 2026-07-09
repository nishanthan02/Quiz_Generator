# core/celery_app.py
# ============================================================
# Celery application factory.
#
# Why Celery + Redis?
# -------------------
# FastAPI is an async web framework optimised for I/O-bound
# work.  Document parsing, embedding generation, and multi-step
# Gemini prompting are CPU-bound and/or take 30–120 seconds.
# Doing them inside a FastAPI request would:
#   (a) block the event loop for async workers, or
#   (b) tie up a thread-pool slot for sync workers.
# Both outcomes hurt concurrency and cause gateway timeouts.
#
# Instead FastAPI does ONE thing: push a task message onto the
# Redis queue and return a job_id immediately (HTTP 202).
# Celery workers pick up the message, do the heavy work, and
# write the result back to SQLite + MinIO.  The client polls
# GET /quiz/status/{job_id} to check progress.
#
# Queue topology:
#   documents  — file extraction + Qdrant ingestion tasks
#   quizzes    — AI generation + shuffling tasks
#
# This separation lets us scale worker pools independently:
#   celery -A core.celery_app worker -Q documents -c 4
#   celery -A core.celery_app worker -Q quizzes   -c 2
# ============================================================

from celery import Celery
from core.config import settings

# ── App factory ──────────────────────────────────────────────

def create_celery_app() -> Celery:
    app = Celery(
        "dynamic_quiz_app",
        broker=settings.redis_url,
        backend=settings.redis_url,
    )

    app.conf.update(
        # Serialisation
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],

        # Timezone
        timezone="UTC",
        enable_utc=True,

        # Routing — map task modules to named queues
        task_routes={
            "workers.document_tasks.*": {"queue": "documents"},
            "workers.quiz_tasks.*":     {"queue": "quizzes"},
        },

        # Retry / reliability settings
        task_acks_late=True,          # Only ack after task completes (safer)
        worker_prefetch_multiplier=1, # Don't grab more tasks than we can run
        task_reject_on_worker_lost=True,

        # Result expiry — keep results for 24 h then clean up Redis
        result_expires=86_400,

        # Auto-discover tasks in the workers package
        include=["workers.document_tasks", "workers.quiz_tasks"],
    )

    return app


# Module-level singleton imported by workers and FastAPI alike:
#   from core.celery_app import celery_app
celery_app = create_celery_app()
