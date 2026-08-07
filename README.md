---
title: Quiz Generator
emoji: 🧠
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
---

# Dynamic Quiz Generator

This repository powers the backend API for the Dynamic Quiz Generator, built for Hugging Face Spaces.

It runs FastAPI, two Celery workers, Redis, and MinIO all within a single Docker container managed by `supervisord`.
