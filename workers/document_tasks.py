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
#                                  8. Encode chunks → 384-dim vectors
#                                  9. Upsert vectors → Qdrant
#                                  10. Update DB row → "complete"
#
# The worker runs in its own process so steps 5–10 (which can
# take 10–60 seconds for large PDFs) never block the FastAPI
# event loop.
# ============================================================

import uuid
from celery import Task
from sentence_transformers import SentenceTransformer
from qdrant_client.http.models import PointStruct

from core.celery_app import celery_app
from core.qdrant_setup import get_qdrant_client, ensure_collection_exists
from core.database import SyncSessionLocal
from core.models import Document
from core.config import settings
from services.minio_service import download_document
from services.text_extractor import extract_text, chunk_text

# ── Lazy model loader ────────────────────────────────────────
# Loading SentenceTransformer downloads ~90 MB on first run.
# We cache it at worker-process level so it's only loaded once
# per worker, not once per task invocation.

_embedding_model: SentenceTransformer | None = None


def _get_embedding_model() -> SentenceTransformer:
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model


    return _embedding_model


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

        # ── Step 8: Encode chunks ───────────────────────────
        model = _get_embedding_model()
        vectors = model.encode(chunks, show_progress_bar=False).tolist()

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
