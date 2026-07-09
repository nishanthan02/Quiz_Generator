# workers/quiz_tasks.py
# ============================================================
# Celery task: run the full Agentic AI workflow to generate
# quiz variants and store the result in MinIO.
#
# Flow triggered by POST /quiz/generate:
#
#   [FastAPI]                    [Redis Queue: "quizzes"]
#       │                                 │
#       │  1. Validate request            │
#       │  2. Insert quiz_job (queued)    │
#       │  3. .delay() ──────────────────►│
#       │  4. Return { job_id, status }   │
#                                         │
#                                  [Celery Worker]
#                                         │
#                                  5.  Update job → "generating"
#                                  6.  RAG: query Qdrant for context
#                                  7.  AGENT 1 (Generator):
#                                        Gemini → 50 candidate Qs
#                                  8.  AGENT 2 (Evaluator):
#                                        Gemini → filter to N valid Qs
#                                  9.  SHUFFLER:
#                                        Python → deal into variants
#                                  10. Upload result JSON → MinIO
#                                  11. Update quiz_job → "complete"
#                                        + store minio_result_path
#
# Total Gemini API calls: always exactly 2, regardless of how
# many variants are requested.  This is the key design decision
# that prevents rate-limiting for large batch requests.
# ============================================================

import time
from celery import Task

from core.celery_app import celery_app
from core.database import SyncSessionLocal
from core.models import Quiz, Question, Option
from services.ai_agents import (
    retrieve_context_from_qdrant,
    run_generator_agent,
    run_evaluator_agent,
)
from services.variant_shuffler import build_variants
from services.minio_service import upload_quiz_result

def update_quiz_job_sync(job_id: int, status: str, minio_result_path: str = None, error_msg: str = None, model_name: str = None, generation_metrics: dict = None):
    with SyncSessionLocal() as db:
        quiz = db.query(Quiz).filter(Quiz.id == job_id).first()
        if quiz:
            quiz.status = status
            if model_name:
                quiz.model_name = model_name
            if generation_metrics:
                quiz.generation_metrics = generation_metrics
            # minio_result_path is deprecated in the new relational model, but kept in signature for compatibility
            db.commit()

def save_generated_questions_sync(job_id: int, questions_data: list):
    with SyncSessionLocal() as db:
        for q_data in questions_data:
            new_q = Question(
                quiz_id=job_id,
                question_text=q_data.get("question", ""),
                question_type=q_data.get("question_type", "mcq") or "mcq",
                marks=1.0
            )
            db.add(new_q)
            db.flush() # get new_q.id
            
            correct_ans = q_data.get("correct_answer", "")
            for opt_text in q_data.get("options", []):
                new_opt = Option(
                    question_id=new_q.id,
                    option_text=opt_text,
                    is_correct=(opt_text == correct_ans)
                )
                db.add(new_opt)
        db.commit()

@celery_app.task(
    name="workers.quiz_tasks.generate_quiz_variants",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    queue="quizzes",
)
def generate_quiz_variants(
    self: Task,
    job_id: int,
    document_id: int,
    topic_focus: str,
    bloom_level: str,
    difficulty: str,
    question_type: str,
    num_variants: int,
    questions_each: int,
    model_id: str = "gemini-2.5-flash",
) -> dict:
    """
    Run the full Generator → Evaluator → Shuffler pipeline.

    Args:
        job_id:         SQLite quiz_jobs.id for status tracking.
        document_id:    SQLite documents.id used to filter Qdrant.
        topic_focus:    User-supplied concept string for RAG query.
        bloom_level:    Bloom's taxonomy level string.
        difficulty:     "Easy" | "Medium" | "Hard".
        question_type:  "MCQ" | "Short Answer".
        num_variants:   How many distinct quiz papers to produce.
        questions_each: Questions per variant paper.

    Returns:
        dict with { "job_id", "num_variants", "minio_result_path" }
    """
    try:
        # ── Step 5: Mark as generating ──────────────────────
        update_quiz_job_sync(job_id, "generating")
        print(f"[QuizTask job={job_id}] Starting generation pipeline.")

        start_time = time.time()

        # ── Step 6: RAG — retrieve relevant context ─────────
        print(f"[QuizTask job={job_id}] Querying Qdrant for document {document_id}.")
        context = retrieve_context_from_qdrant(
            document_id=document_id,
            topic_focus=topic_focus,
            top_k=8,   # fetch 8 chunks for rich context
        )

        # ── Step 7: Generator Agent (API call #1) ────────────
        # Master Prompt explicitly requests variants mirrored structurally. 
        # Bank size is exactly the required total question count.
        target_bank_size = num_variants * questions_each
        
        print(f"[QuizTask job={job_id}] Running Generator Agent using {model_id} ({target_bank_size} candidates expected for {num_variants} variants).")
        raw_bank = run_generator_agent(
            context=context,
            topic_focus=topic_focus,
            bloom_level=bloom_level,
            difficulty=difficulty,
            question_type=question_type,
            num_variants=num_variants,
            questions_each=questions_each,
            model_id=model_id
        )

        # ── Step 8: Evaluator Agent (API call #2) ────────────
        print(f"[QuizTask job={job_id}] Running Evaluator Agent using {model_id}.")
        validated_bank = run_evaluator_agent(
            questions=raw_bank,
            context=context,
            model_id=model_id
        )

        # ── Step 9: Shuffler — pure Python, no API calls ─────
        print(f"[QuizTask job={job_id}] Shuffling {num_variants} variants.")
        variants = build_variants(
            validated_bank=validated_bank,
            num_variants=num_variants,
            questions_each=questions_each,
        )

        # ── Step 10: Upload result to MinIO ──────────────────
        result_payload = {
            "job_id":       job_id,
            "document_id":  document_id,
            "topic_focus":  topic_focus,
            "bloom_level":  bloom_level,
            "difficulty":   difficulty,
            "question_type": question_type,
            "num_variants": num_variants,
            "questions_each": questions_each,
            "bank_size":    len(validated_bank),
            "variants":     variants,
        }

        minio_path = upload_quiz_result(result_payload["variants"], job_id)
        print(f"[QuizTask job={job_id}] Result uploaded to MinIO: {minio_path}")

        # ── Step 11: Mark complete & Save standard questions ──
        save_generated_questions_sync(job_id, validated_bank)

        end_time = time.time()
        latency_ms = int((end_time - start_time) * 1000)
        metrics = {
            "latency_ms": latency_ms,
            "input_tokens": 0,
            "output_tokens": 0
        }

        update_quiz_job_sync(
            job_id=job_id,
            status="complete",
            minio_result_path=minio_path,
            model_name=model_id,
            generation_metrics=metrics
        )

        return {
            "job_id":            job_id,
            "num_variants":      num_variants,
            "validated_bank_size": len(validated_bank),
            "minio_result_path": minio_path,
        }

    except Exception as exc:
        update_quiz_job_sync(job_id, "failed", error_msg=str(exc))
        print(f"[QuizTask job={job_id}] FAILED: {exc}")
        # Not retrying here to allow the UI to immediately reflect the failure state
        return {"status": "failed", "error": str(exc)}
