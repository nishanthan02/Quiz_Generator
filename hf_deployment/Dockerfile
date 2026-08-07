# ============================================================
# Dockerfile — HF Spaces Quiz Generator
#
# Runs FastAPI, Celery, Redis, and MinIO in a single container
# managed by supervisord on port 7860.
# ============================================================

FROM python:3.11-slim

# ── System dependencies & Services ───────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        redis-server \
        supervisor \
        wget \
    && rm -rf /var/lib/apt/lists/*

# ── Install MinIO ─────────────────────────────────────────────
RUN wget -qO /usr/local/bin/minio https://dl.min.io/server/minio/release/linux-amd64/minio \
    && chmod +x /usr/local/bin/minio

# ── Create required directories & User setup ──────────────────
# HF Spaces run as UID 1000. We must create the user and give it
# ownership over the directories our services need to write to.
RUN useradd -m -u 1000 user \
    && mkdir -p /data \
    && mkdir -p /var/log/supervisor \
    && chown -R 1000:1000 /data /var/log/supervisor /var/log/redis /var/lib/redis /etc/supervisor

# ── Working directory ─────────────────────────────────────────
WORKDIR /app
RUN chown 1000:1000 /app

# Switch to the non-root user HF expects
USER user

# ── Python dependencies ───────────────────────────────────────
COPY --chown=1000:1000 requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Application source & Config ───────────────────────────────
COPY --chown=1000:1000 . .
COPY --chown=1000:1000 supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# ── Entrypoint ────────────────────────────────────────────────
# Port 7860 is mandated by Hugging Face Spaces
EXPOSE 7860

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
