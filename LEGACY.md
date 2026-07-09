# Dynamic AI Quiz Generator — Legacy Guide
**Also known as: Aegis AI Quiz Suite**

Welcome to the project legacy document. This guide is specifically written for upcoming senior developers and engineers who will maintain, extend, and deploy this software. It details our full technical stack, the application architecture, background processing pipelines, database design, and our step-by-step feature sets.

---

## 1. Project Overview & Objective
This application is a cutting-edge **EdTech platform** (often used as an API for LMS plugins like Moodle or run standalone alongside its React UI). It allows educational faculty to upload course materials (PDFs, PPTs) to a private knowledge base. Using a complex **Agentic AI Workflow**, it processes these documents into vector embeddings (using a RAG pipeline) and automatically generates **massive, anti-cheat quiz variant sets** based on specific parameters like Bloom's Taxonomy levels or difficulty. 

These quizzes are then administered to students directly on the platform where automatic grading is processed.

---

## 2. Technical Stack

Our stack relies on modern, highly scalable, and async-first technologies.

### Backend Infrastructure
*   **Web Framework:** FastAPI (Python 3) for high-performance async REST APIs.
*   **Web Server:** Uvicorn.
*   **Task Queue & Background Jobs:** Celery, backed by **Redis** as the message broker.
*   **Authentication:** JWT (JSON Web Tokens) with Python-JOSE and bcrypt for password hashing.
*   **Database ORM:** SQLAlchemy 2.0 (using `AsyncSession`).
*   **Object Storage:** MinIO (S3-compatible) for highly scalable raw document storage.

### AI, ML & Vector Database
*   **Large Language Model:** Google Gemini (`google-genai`).
*   **Embeddings:** `sentence-transformers` for creating high-dimensional numeric representations of text.
*   **Vector Database:** Qdrant (`qdrant-client`) for extremely fast similarity searches on document embeddings.
*   **Document Parsers:** `PyMuPDF` (fitz) and `python-pptx` to chunk real-world course documents.

### Frontend
*   **Framework:** React 19 with Vite.
*   **Routing:** React Router v7.
*   **Styling:** Tailwind CSS v4 alongside `clsx` and `tailwind-merge` for utility class manipulation.
*   **Animations:** Framer Motion for premium micro-animations and wizard transitions.
*   **Icons & Assets:** Lucide React.
*   **API Calling:** Axios with interceptor-based request/response handling.

---

## 3. Core Roles & Features 

### A. Role-Based Access Control (RBAC)
The application handles three distinct user flows:
1.  **Admin:** System management (future extension point).
2.  **Faculty:** Has complete authority over specific *Subjects*. They can upload knowledge documents, build interactive quizzes, view global gradebooks, and trigger AI Agents.
3.  **Student:** Can enroll in subjects, view published quizzes, take assessments dynamically, and receive immediate scores. 

### B. Intelligent Document Ingestion
When faculty upload a syllabus or slide deck:
1.  The FastAPI router (`routers/management.py`) saves the raw file to **MinIO**.
2.  An asynchronous Celery task (`workers/document_tasks.py`) is fired instantly.
3.  The task extracts plain text using `services/text_extractor.py`.
4.  Text is chunked, mapped to dense semantic vectors using `sentence-transformers`, and finally stored inside **Qdrant**.

### C. Agentic AI Quiz Generation Configuration
The AI generation pipeline requires context. The faculty launches an interactive 4-step wizard setting:
*   **Target Document:** Selects a fully ingested file from Qdrant.
*   **Topic Focus & Depth:** e.g., "Advanced backpropagation in Neural Networks."
*   **Bloom's Taxonomy Level:** Controls cognitive rigor (Understand, Apply, Analyze, Evaluate, Create).
*   **Output Specifications:** Defines question type (MCQ), difficulty range, and the number of questions per variant.

### D. Anti-Cheat Variant Engine
When the AI generates questions (`workers/quiz_tasks.py`), it creates "Variant Sets" to fight cheating. If a faculty requests 3 variants of a 10-question quiz, the Gemini LLM will synthesize 3 mathematically or contextually distinct versions of similar concepts. These are persisted directly to the relational database using standard relational mappings, and mapped separately to different students so no two adjacent students receive the identical test.

---

## 4. Directory & Module Architecture

### `main.py`
The FastAPI application factory. Responsible for setting up the ASGI server, CORS middleware, mounting route prefix blueprints (`/auth`, `/management`, `/learning`), and establishing FastAPI's lifespan configuration (booting up SQLite/Postgres DB Sync and ensuring Qdrant collections exist).

### `core/` (Configuration & Data Layer)
*   `models.py`: Centralized SQLAlchemy schema declarations. Key tables include `User`, `Subject`, `Document`, `Quiz`, `Question`, `Option`, `StudentEnrollment`, and `StudentAttempt`.
*   `database.py`: SQLAlchemy connection engine bootstrapping.
*   `config.py`: Dynamic environment variable loader (Pydantic Settings interface).
*   `celery_app.py`: Broker setup and worker bindings.
*   `qdrant_setup.py` & `security.py`: External dependencies boot up logic.

### `routers/` (REST API Controllers)
These files map HTTP protocol requests to business logic, enforcing strictly typed `Pydantic` request and response models.
*   `auth_router.py`: Deals strictly with POST `/login`, JWT provision, and fast dependancy functions (`get_current_student`, `get_current_faculty`).
*   `management.py`: Used heavily by the React Frontend to list subjects, upload to MinIO, define Quiz details, and get real-time state flags status mapping (`Pending` -> `Generating` -> `Complete`). 
*   `learning.py`: Manages student session attempts, tracking `StudentAttempt` and `AttemptAnswer` to calculate and return `score` float values.

### `services/` (Business Logic & Vendor integrations)
*   `ai_agents.py`: System prompt injection, interaction logic specifically for calling `gemini` with properly formulated contextual contexts pulled from Qdrant.
*   `text_extractor.py`: Clean string parsing rules for edge-cases in PDF layouts and PPT format extractions. 
*   `variant_shuffler.py`: The algorithms to randomly assign test permutations per student.

### `workers/` (Asynchronous Celery Daemons)
Where large scale blocking tasks operate to keep our FastAPI router sub-100ms.
*   `document_tasks.py`: `process_document` handles AI vector mappings and statuses updating.
*   `quiz_tasks.py`: `generate_quiz_variants` makes blocking HTTP calls outward to the LLM. It parses the JSON back from the model and translates it directly into batch database `INSERT` commands to `questions` and `options` tables.

### `frontend/` (Modern React Application)
Bootstrapped with Vite. High attention to UX/UI details using Tailwind CSS. Contains a deeply woven state machine for polling background updates from Celery backend so that the faculty experiences single-page-app flow without hard reloading. Components are abstracted specifically (`components/layout`, `components/wizard`) making routing very declarative within `App.jsx`.

---

## 5. Development Setup & Deployment Notes

**1. Environment Variables:** Start by copying `.env.example` to `.env`. Ensure your `GEMINI_API_KEY`, MinIO credentials, Redis URL, and DB keys are properly allocated.

**2. Storage Dependencies:** Ensure that your background Docker containers (Local Qdrant, Redis, and MinIO) are alive before running migrations. 

**3. Starting the Backend:**
*   **Web Server:** `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
*   **Celery Worker pool:** `celery -A core.celery_app worker --loglevel=info`

**4. Starting the Frontend:** Navigate to `/frontend` run `npm install` and then `npm run dev`.

---

*This application is built intentionally lean but highly interconnected. Ensure you understand the split between the Synchronous API flow (FastAPI routing) vs. the Asynchronous Worker flows (Celery + LLMs/Qdrant) before committing architectural refactors.*
