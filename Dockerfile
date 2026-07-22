# ============================================================
# Dockerfile — dynamic_quiz_app
#
# Single image used by all three app services (api, worker-documents,
# worker-quizzes). docker-compose overrides CMD per service so we
# don't need a default CMD here.
#
# Build context: project root
# Target runtime: Linux (ARM64 — Oracle Cloud Ampere)
# ============================================================

FROM python:3.11-slim

# ── System dependencies ──────────────────────────────────────
# build-essential is needed by psycopg2-binary and cryptography.
# libpq-dev provides the PostgreSQL client headers for psycopg2.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory ─────────────────────────────────────────
WORKDIR /app

# ── Python dependencies ───────────────────────────────────────
# Copy requirements first so Docker can cache this layer.
# The app source is copied separately so code changes don't
# invalidate the pip install layer.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Application source ────────────────────────────────────────
COPY . .

# ── Runtime user (non-root for security) ─────────────────────
RUN useradd --no-create-home --shell /bin/false appuser
USER appuser
