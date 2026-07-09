# routers/document_routes.py
# ============================================================
# FastAPI router for document management endpoints.
#
# Endpoints:
#   POST /documents/upload   — Accept a file, store in MinIO,
#                              enqueue the extraction Celery task.
#   GET  /documents/{doc_id} — Poll the processing status.
#
# FastAPI's ONLY job here is:
#   1. Validate the incoming request (Pydantic does this).
#   2. Save the file bytes to MinIO (fast I/O, milliseconds).
#   3. Insert a DB row (SQLite write, milliseconds).
#   4. Call .delay() to push the task onto the Redis queue.
#   5. Return HTTP 202 Accepted with the job tracking ID.
#
# Everything slow (text extraction, embedding, Qdrant upsert)
# happens in the Celery worker process — completely decoupled.
# ============================================================

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from core.database import create_document_sync, get_document_async
from services.minio_service import upload_document
from workers.document_tasks import process_document  # Celery task

router = APIRouter(prefix="/documents", tags=["Documents"])


# ── Request / Response schemas ────────────────────────────────

class UploadResponse(BaseModel):
    document_id: int
    status: str
    message: str


class DocumentStatusResponse(BaseModel):
    document_id: int
    filename: str
    status: str          # pending | processing | complete | failed
    error_msg: str | None
    created_at: str
    updated_at: str


# ── Endpoints ────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {"pdf", "pptx"}


@router.post("/upload", response_model=UploadResponse, status_code=202)
async def upload_document_endpoint(
    file: UploadFile = File(..., description="Course material (.pdf or .pptx)"),
    user_id: str = Form(..., description="Moodle user identifier"),
):
    """
    Upload a course document for processing.

    Returns HTTP 202 immediately with a `document_id`.
    The client should poll GET /documents/{document_id} until
    status = "complete" before requesting a quiz.
    """
    # ── Validate file type ────────────────────────────────
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '.{ext}' is not supported. Upload a .pdf or .pptx file.",
        )

    # ── Read file bytes ───────────────────────────────────
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # ── Save to MinIO (fast) ──────────────────────────────
    minio_path = upload_document(file_bytes, file.filename)

    # ── Insert DB row ─────────────────────────────────────
    doc_id = create_document_sync(
        user_id=user_id,
        filename=file.filename,
        minio_path=minio_path,
    )

    # ── Enqueue Celery task ───────────────────────────────
    # .delay() is non-blocking: it pushes a JSON message to Redis
    # and returns a Celery AsyncResult immediately.
    process_document.delay(
        document_id=doc_id,
        minio_path=minio_path,
        filename=file.filename,
    )

    return UploadResponse(
        document_id=doc_id,
        status="pending",
        message=(
            f"File '{file.filename}' received and queued for processing. "
            f"Poll GET /documents/{doc_id} for status updates."
        ),
    )


@router.get("/{doc_id}", response_model=DocumentStatusResponse)
async def get_document_status(doc_id: int):
    """
    Check the processing status of an uploaded document.
    Moodle plugins should poll this until status = "complete"
    before calling the quiz generation endpoint.
    """
    doc = await get_document_async(doc_id)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail=f"Document with id={doc_id} not found.",
        )
    doc["document_id"] = doc.pop("id")
    return DocumentStatusResponse(**doc)    
