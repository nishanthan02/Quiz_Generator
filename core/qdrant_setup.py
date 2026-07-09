# core/qdrant_setup.py
# ============================================================
# Qdrant client singleton and collection bootstrap.
#
# Qdrant stores our document chunk embeddings.
# Each point in the collection contains:
#   - vector  : 384-dim float32 (all-MiniLM-L6-v2 output)
#   - payload : { "text": <chunk text>, "document_id": <int>,
#                 "user_id": <str>, "chunk_index": <int> }
#
# The collection is created on first use with COSINE distance
# to match the behaviour of the original cosine_similarity call.
# ============================================================

from qdrant_client import QdrantClient
from qdrant_client.http.models import (
    Distance,
    VectorParams,
    OptimizersConfigDiff,
)
from core.config import settings

# Embedding dimension produced by all-MiniLM-L6-v2
EMBEDDING_DIM = 384

# ── Singleton client ─────────────────────────────────────────
# Module-level variable; the client is created once per process.
# Both FastAPI and Celery workers import this module, so each
# process gets exactly one gRPC/HTTP connection pool.

_qdrant_client: QdrantClient | None = None


def get_qdrant_client() -> QdrantClient:
    """
    Return the module-level Qdrant client, creating it on first call.
    Thread-safe for read workloads; collection creation is idempotent.
    """
    global _qdrant_client
    if _qdrant_client is None:
        if settings.qdrant_url and settings.qdrant_api_key:
            _qdrant_client = QdrantClient(
                url=settings.qdrant_url,
                api_key=settings.qdrant_api_key,
                timeout=30,
            )
        else:
            _qdrant_client = QdrantClient(
                host=settings.qdrant_host,
                port=settings.qdrant_port,
                # Set a generous timeout — embedding uploads can be slow
                timeout=30,
            )
    return _qdrant_client


def ensure_collection_exists() -> None:
    """
    Idempotently create the Qdrant collection if it doesn't exist.
    Safe to call multiple times (e.g. at startup and in worker init).
    """
    try:
        client = get_qdrant_client()
        existing = {c.name for c in client.get_collections().collections}

        if settings.qdrant_collection_name not in existing:
            client.create_collection(
                collection_name=settings.qdrant_collection_name,
                vectors_config=VectorParams(
                    size=EMBEDDING_DIM,
                    distance=Distance.COSINE,
                ),
                # Reduce indexing overhead while collection is small;
                # Qdrant will switch to HNSW automatically as it grows.
                optimizers_config=OptimizersConfigDiff(indexing_threshold=10_000),
            )
            print(f"[Qdrant] Created collection '{settings.qdrant_collection_name}'")
        else:
            print(f"[Qdrant] Collection '{settings.qdrant_collection_name}' already exists.")
    except Exception as e:
        print(f"[Warning] Qdrant connection failed: {e}. AI embeddings will be unavailable until Qdrant is running on port 6333.")
