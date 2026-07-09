# routers/quiz_routes.py
# ============================================================
# FastAPI router for quiz generation and retrieval endpoints.
#
# Endpoints:
#   POST /quiz/generate          — Queue an AI generation job.
#   GET  /quiz/status/{job_id}   — Poll the generation status.
#   GET  /quiz/download/{job_id} — Get a pre-signed MinIO URL
#                                  to download the result JSON.
#
# The same "fire-and-forget + poll" pattern used for document
# upload applies here.  FastAPI queues the task and returns
# HTTP 202 immediately.  The Celery worker runs the two Gemini
# agent calls, shuffles the variants, and uploads the result.
# ============================================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.database import (
    create_quiz_job_sync,
    get_quiz_job_async,
    get_document_async,
)
from services.minio_service import get_quiz_download_url
from workers.quiz_tasks import generate_quiz_variants  # Celery task

router = APIRouter(prefix="/quiz", tags=["Quiz"])


# ── Request / Response schemas ────────────────────────────────

class QuizGenerateRequest(BaseModel):
    user_id: str         = Field(..., description="Moodle user identifier")
    document_id: int     = Field(..., description="ID returned by POST /documents/upload")
    topic_focus: str     = Field(..., description="Concept or topic to focus questions on")
    bloom_level: str     = Field(
        ...,
        description="Bloom's taxonomy level",
        examples=["Remember", "Understand", "Apply", "Analyze"],
    )
    difficulty: str      = Field(
        ...,
        description="Question difficulty",
        examples=["Easy", "Medium", "Hard"],
    )
    question_type: str   = Field(
        ...,
        description="MCQ or Short Answer",
        examples=["MCQ", "Short Answer"],
    )
    num_variants: int    = Field(
        default=10,
        ge=1,
        le=50,
        description="Number of distinct quiz variants to generate",
    )
    questions_each: int  = Field(
        default=10,
        ge=1,
        le=30,
        description="Number of questions per variant",
    )


class QuizGenerateResponse(BaseModel):
    job_id: int
    status: str
    message: str


class QuizStatusResponse(BaseModel):
    job_id: int
    document_id: int
    status: str           # queued | generating | complete | failed
    num_variants: int
    questions_each: int
    minio_result_path: str | None
    error_msg: str | None
    created_at: str
    updated_at: str


class QuizDownloadResponse(BaseModel):
    job_id: int
    download_url: str
    expires_in_seconds: int


# ── Validation helpers ────────────────────────────────────────

VALID_BLOOM  = {"Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"}
VALID_DIFF   = {"Easy", "Medium", "Hard"}
VALID_QTYPE  = {"MCQ", "Short Answer"}


def _validate_quiz_request(req: QuizGenerateRequest) -> None:
    errors = []
    if req.bloom_level not in VALID_BLOOM:
        errors.append(f"bloom_level must be one of {VALID_BLOOM}")
    if req.difficulty not in VALID_DIFF:
        errors.append(f"difficulty must be one of {VALID_DIFF}")
    if req.question_type not in VALID_QTYPE:
        errors.append(f"question_type must be one of {VALID_QTYPE}")
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))


# ── Endpoints ────────────────────────────────────────────────

@router.post("/generate", response_model=QuizGenerateResponse, status_code=202)
async def generate_quiz(req: QuizGenerateRequest):
    """
    Queue an AI quiz generation job.

    Prerequisites:
      - The document referenced by `document_id` must have
        status = "complete" (i.e. already processed into Qdrant).

    Returns HTTP 202 immediately with a `job_id`.
    Poll GET /quiz/status/{job_id} until status = "complete",
    then call GET /quiz/download/{job_id} to get the result URL.
    """
    _validate_quiz_request(req)

    # Guard: document must be processed before we can search it
    doc = await get_document_async(req.document_id)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail=f"Document id={req.document_id} not found.",
        )
    if doc["status"] != "complete":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Document id={req.document_id} is not ready "
                f"(current status: '{doc['status']}'). "
                "Wait for processing to complete before generating a quiz."
            ),
        )

    # Insert job row
    job_id = create_quiz_job_sync(
        user_id=req.user_id,
        document_id=req.document_id,
        topic_focus=req.topic_focus,
        bloom_level=req.bloom_level,
        difficulty=req.difficulty,
        question_type=req.question_type,
        num_variants=req.num_variants,
        questions_each=req.questions_each,
    )

    # Enqueue Celery task (non-blocking)
    generate_quiz_variants.delay(
        job_id=job_id,
        document_id=req.document_id,
        topic_focus=req.topic_focus,
        bloom_level=req.bloom_level,
        difficulty=req.difficulty,
        question_type=req.question_type,
        num_variants=req.num_variants,
        questions_each=req.questions_each,
    )

    return QuizGenerateResponse(
        job_id=job_id,
        status="queued",
        message=(
            f"Quiz generation job {job_id} queued. "
            f"Poll GET /quiz/status/{job_id} for progress."
        ),
    )


@router.get("/status/{job_id}", response_model=QuizStatusResponse)
async def get_quiz_status(job_id: int):
    """
    Poll the status of a quiz generation job.
    Possible status values: queued → generating → complete | failed
    """
    job = await get_quiz_job_async(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Quiz job id={job_id} not found.",
        )
    job["job_id"] = job.pop("id")
    return QuizStatusResponse(**job)


@router.get("/download/{job_id}", response_model=QuizDownloadResponse)
async def download_quiz(job_id: int, expires: int = 3600):
    """
    Generate a pre-signed MinIO URL to download the quiz variants JSON.
    The URL expires after `expires` seconds (default: 1 hour).

    The Moodle plugin should:
      1. Hit this endpoint to get the URL.
      2. Fetch the JSON directly from MinIO using the URL.
         (This avoids routing large payloads through FastAPI.)
    """
    job = await get_quiz_job_async(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Quiz job id={job_id} not found.")
   
    job["job_id"] = job.pop("id")
    if job["status"] != "complete":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Quiz job {job_id} is not complete "
                f"(status: '{job['status']}'). "
                "Download is only available after generation completes."
            ),
        )

    download_url = get_quiz_download_url(
        minio_path=job["minio_result_path"],
        expires_seconds=expires,
    )

    return QuizDownloadResponse(
        job_id=job_id,
        download_url=download_url,
        expires_in_seconds=expires,
    )
