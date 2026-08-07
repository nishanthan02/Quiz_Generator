# services/minio_service.py
# ============================================================
# All interaction with MinIO object storage lives here.
#
# MinIO is used for two purposes:
#   1. Raw uploads  — the original .pdf / .pptx files uploaded
#      by professors are stored in BUCKET_DOCUMENTS so we can
#      re-process them later without asking for a re-upload.
#
#   2. Quiz results — after generation the final JSON (array of
#      variant objects) is stored in BUCKET_QUIZZES and the
#      object path is saved in SQLite.  The Moodle plugin can
#      then call GET /quiz/download/{job_id} to fetch a
#      pre-signed URL and download the file directly from MinIO.
#
# Buckets are created automatically on first use.
# ============================================================

import io
import json
import uuid
from minio import Minio
from minio.error import S3Error
from core.config import settings

# ── Singleton client ─────────────────────────────────────────

_minio_client: Minio | None = None


def get_minio_client() -> Minio:
    global _minio_client
    if _minio_client is None:
        _minio_client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_use_ssl,
        )
        _ensure_buckets(_minio_client)
    return _minio_client


def _ensure_buckets(client: Minio) -> None:
    """Create required buckets if they don't already exist."""
    for bucket in (settings.minio_bucket_documents, settings.minio_bucket_quizzes):
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
            print(f"[MinIO] Created bucket '{bucket}'")


# ── Document storage ─────────────────────────────────────────

def upload_document(file_bytes: bytes, original_filename: str) -> str:
    """
    Upload a raw document file to MinIO.

    Returns the object path (bucket/object_name) which is stored
    in the SQLite documents table for later retrieval.

    The object name is prefixed with a UUID to avoid collisions
    when multiple users upload files with the same name.
    """
    client = get_minio_client()
    ext = original_filename.rsplit(".", 1)[-1].lower()
    object_name = f"{uuid.uuid4()}_{original_filename}"

    content_type_map = {
        "pdf":  "application/pdf",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }
    content_type = content_type_map.get(ext, "application/octet-stream")

    client.put_object(
        bucket_name=settings.minio_bucket_documents,
        object_name=object_name,
        data=io.BytesIO(file_bytes),
        length=len(file_bytes),
        content_type=content_type,
    )
    # Return the full "bucket/object" path for easy retrieval
    return f"{settings.minio_bucket_documents}/{object_name}"


def download_document(minio_path: str) -> bytes:
    """
    Download a document by its stored minio_path.
    minio_path format: "bucket-name/object-name"
    """
    if minio_path.startswith("tmp_uploads/"):
        with open(minio_path, "rb") as f:
            return f.read()
            
    client = get_minio_client()
    bucket, object_name = minio_path.split("/", 1)
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


# ── Quiz result storage ──────────────────────────────────────

def upload_quiz_result(quiz_variants: list[dict], job_id: int) -> str:
    """
    Serialise the list of quiz variant dicts to JSON and store
    in MinIO.  Returns the object path for saving in SQLite.
    """
    client = get_minio_client()
    json_bytes = json.dumps(quiz_variants, indent=2, ensure_ascii=False).encode("utf-8")
    object_name = f"quiz_job_{job_id}.json"

    client.put_object(
        bucket_name=settings.minio_bucket_quizzes,
        object_name=object_name,
        data=io.BytesIO(json_bytes),
        length=len(json_bytes),
        content_type="application/json",
    )
    return f"{settings.minio_bucket_quizzes}/{object_name}"


def get_quiz_download_url(minio_path: str, expires_seconds: int = 3600) -> str:
    """
    Generate a pre-signed GET URL so Moodle can download the quiz
    JSON directly from MinIO without going through FastAPI.
    Default expiry: 1 hour.
    """
    from datetime import timedelta
    client = get_minio_client()
    bucket, object_name = minio_path.split("/", 1)
    url = client.presigned_get_object(
        bucket_name=bucket,
        object_name=object_name,
        expires=timedelta(seconds=expires_seconds),
    )
    return url
