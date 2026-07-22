# workers/document_tasks.py
# ============================================================
# Celery task: process an uploaded document into Qdrant vectors.
#
# Flow triggered by POST /documents/upload:
#
#   [FastAPI]                    [Redis Queue: "documents"]
#       │                                 │
#       │  1. Save file → MinIO           │
#       │  2. Insert DB row (pending)     │
#       │  3. .delay() ──────────────────►│
#       │  4. Return { doc_id, status }   │
#                                         │
#                                  [Celery Worker]
#                                         │
#                                  5. Download bytes from MinIO
#                                  6. Extract text (PDF/PPTX)
#                                  7. Chunk text (250w / 50w overlap)
#                                  8. Encode chunks → 1024-dim vectors (Cohere API)
#                                  9. Upsert vectors → Qdrant
#                                  10. Update DB row → "complete"
#
# The worker runs in its own process so steps 5–10 (which can
# take 10–60 seconds for large PDFs) never block the FastAPI
# event loop.
# ============================================================

import uuid
from celery import Task
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)
import logging
from qdrant_client.http.models import PointStruct

from core.celery_app import celery_app
from core.qdrant_setup import get_qdrant_client, ensure_collection_exists
from core.database import SyncSessionLocal
from core.models import Document
from core.config import settings
from services.minio_service import download_document
from services.text_extractor import extract_text, chunk_text

logger = logging.getLogger(__name__)

# ── Retry predicate ───────────────────────────────────────────
# Retry on Cohere rate-limit (429) or transient server errors
# (500 / 503).  We check the exception message since Cohere SDK
# raises generic exceptions with the HTTP status embedded.

def _is_retryable_cohere_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return any(code in msg for code in ["429", "500", "503", "too many requests", "rate limit"])

# ── Cohere Embedding client ───────────────────────────────────
# We use Cohere's embed-english-v3.0 model (1024-dim).
# The Cohere SDK is already used in this project for LLM calls
# (command-r-08-2024), so no new dependency is needed.
# The client is cached at worker-process level so we don't
# re-authenticate on every task invocation.

_cohere_client = None


def _get_cohere_client():
    """Return a cached Cohere client for embedding calls."""
    global _cohere_client
    if _cohere_client is None:
        import cohere
        _cohere_client = cohere.ClientV2(api_key=settings.cohere_api_key)
    return _cohere_client


def _embed_texts(texts: list[str], input_type: str = "search_document") -> list[list[float]]:
    """
    Embed a list of texts using Cohere embed-english-v3.0.

    Sends all texts in a single batched API call (up to 96 per request).
    Retries automatically on rate-limit (429) or server errors (500/503)
    with exponential backoff — up to 5 attempts, waiting 2→4→8→16→32 s.
    This prevents a transient Cohere hiccup from failing the Celery job.

    Args:
        texts:      The list of text strings to embed.
        input_type: Cohere input type hint.
                    Use "search_document" for document chunks,
                    "search_query" for a search query.

    Returns:
        A list of 1024-dimensional float vectors, one per input text.
    """
    client = _get_cohere_client()
    # Cohere supports up to 96 texts per embed call
    BATCH_SIZE = 96
    all_vectors: list[list[float]] = []

    for batch_start in range(0, len(texts), BATCH_SIZE):
        batch = texts[batch_start : batch_start + BATCH_SIZE]
        vectors = _embed_batch_with_retry(client, batch, input_type)
        all_vectors.extend(vectors)

    return all_vectors


@retry(
    retry=retry_if_exception(_is_retryable_cohere_error),
    wait=wait_exponential(multiplier=1, min=2, max=32),
    stop=stop_after_attempt(5),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _embed_batch_with_retry(
    client,
    batch: list[str],
    input_type: str,
) -> list[list[float]]:
    """Single Cohere embed call, wrapped with tenacity retry."""
    response = client.embed(
        texts=batch,
        model="embed-english-v3.0",
        input_type=input_type,
        embedding_types=["float"],
    )
    return response.embeddings.float


def update_document_status_sync(doc_id: int, status: str, error_msg: str = None):
    with SyncSessionLocal() as db:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.status = status
            if error_msg:
                doc.error_msg = error_msg
            db.commit()


# ── Celery Task ──────────────────────────────────────────────

@celery_app.task(
    name="workers.document_tasks.process_document",
    bind=True,           # `self` gives access to retry / task metadata
    max_retries=3,
    default_retry_delay=30,  # seconds between retries
    queue="documents",
)
def process_document(self: Task, document_id: int, minio_path: str, filename: str) -> dict:
    """
    Extract text from a stored document and ingest it into Qdrant.

    Args:
        document_id: SQLite documents.id — used as payload in Qdrant points
                     so we can filter search results by document.
        minio_path:  The "bucket/object" path stored in SQLite.
        filename:    Original filename — used to detect file type.

    Returns:
        dict with { "document_id", "chunks_ingested", "status" }
    """
    try:
        # ── Mark as processing ──────────────────────────────
        update_document_status_sync(document_id, "processing")

        # ── Step 5: Download raw bytes from MinIO ───────────
        print(f"[DocTask {document_id}] Downloading from MinIO: {minio_path}")
        file_bytes = download_document(minio_path)

        # ── Step 6: Extract text ────────────────────────────
        print(f"[DocTask {document_id}] Extracting text from '{filename}'")
        text = extract_text(file_bytes, filename)
        if not text.strip():
            raise ValueError("No text could be extracted from the document.")

        # ── Step 7: Chunk text ──────────────────────────────
        chunks = chunk_text(text, chunk_size=250, overlap=50)
        print(f"[DocTask {document_id}] Created {len(chunks)} chunks.")

        # ── Step 8: Encode chunks via Cohere API ────────────
        print(f"[DocTask {document_id}] Generating embeddings via Cohere API (embed-english-v3.0)...")
        vectors = _embed_texts(chunks, input_type="search_document")

        # ── Step 9: Upsert into Qdrant ──────────────────────
        ensure_collection_exists()
        client = get_qdrant_client()

        points = [
            PointStruct(
                id=str(uuid.uuid4()),          # Qdrant requires string or int UUID
                vector=vector,
                payload={
                    "text":         chunk,
                    "document_id":  document_id,
                    "chunk_index":  i,
                },
            )
            for i, (chunk, vector) in enumerate(zip(chunks, vectors))
        ]

        # Upsert in batches of 100 to stay within request size limits
        batch_size = 100
        for batch_start in range(0, len(points), batch_size):
            batch = points[batch_start : batch_start + batch_size]
            client.upsert(
                collection_name=settings.qdrant_collection_name,
                points=batch,
            )

        print(f"[DocTask {document_id}] Upserted {len(points)} vectors to Qdrant.")

        # ── Step 10: Mark complete ──────────────────────────
        update_document_status_sync(document_id, "complete")

        return {
            "document_id":    document_id,
            "chunks_ingested": len(points),
            "status":         "complete",
        }

    except ValueError as val_err:
        # A ValueError (e.g. unsupported file type) won't succeed on retry
        update_document_status_sync(document_id, "failed", error_msg=str(val_err))
        print(f"[DocTask {document_id}] FATAL EXCEPTION: {val_err}")
        return {"document_id": document_id, "status": "failed", "error": str(val_err)}

    except Exception as exc:
        # On failure: update DB then retry (up to max_retries)
        update_document_status_sync(
            document_id, "failed", error_msg=str(exc)
        )
        print(f"[DocTask {document_id}] FAILED: {exc}")
        # Re-raise so Celery can retry / mark as FAILURE
        raise self.retry(exc=exc)
