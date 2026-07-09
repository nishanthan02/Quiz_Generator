# services/ai_agents.py
# ============================================================
# Agentic AI Workflow — Generator + Evaluator pattern.
#
# This is the core intelligence of the system, refactored from
# the single Gemini prompt in the prototype into a two-step
# pipeline that produces cleaner, more reliable output.
#
# WHY TWO STEPS?
# --------------
# Asking a single prompt to "generate 30 perfect questions" at
# once leads to:
#   - Hallucinated facts not in the source material
#   - Duplicate or near-duplicate questions
#   - Uneven Bloom's taxonomy coverage
#   - Hitting token output limits on a single response
#
# The Generator→Evaluator pattern solves this:
#   Step 1 (Generator)  : Ask Gemini to generate a LARGE "Master
#                         Bank" of 50 candidate questions.
#                         More candidates = more variety to pick from.
#
#   Step 2 (Evaluator)  : Pass all 50 to a *second* Gemini prompt
#                         acting as a strict judge.  It removes:
#                           - Questions not grounded in the context
#                           - Duplicate / similar questions
#                           - Questions with wrong answers
#                         Returns only the validated subset.
#
#   Step 3 (Shuffler)   : Pure Python (variant_shuffler.py) deals
#                         the validated bank into N quiz variants.
#                         No extra API calls needed.
#
# RATE LIMIT STRATEGY:
# The two API calls are bounded (1 large + 1 medium prompt) no
# matter how many variants are requested.  Generating 30 variants
# of 10 questions each still only costs 2 API calls.
# ============================================================

import json
import re
from google import genai
from core.config import settings
from dotenv import load_dotenv

load_dotenv()

# ── Gemini client singleton ──────────────────────────────────

_gemini_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        import os
        api_key = os.getenv("GOOGLE_API_KEY", settings.gemini_api_key)
        _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


def _call_llm(model_id: str, prompt: str) -> str:
    """
    Unified wrapper to call various LLMs based on model_id.
    Returns the raw text of the first candidate.
    """
    import os
    if model_id == "gemini-2.5-flash":
        client = _get_client()
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        if not response.text:
            raise RuntimeError("Gemini returned an empty response.")
        return response.text
        
    elif model_id in ["Mistral-small", "gpt-4o-mini"]:
        from openai import OpenAI
        client = OpenAI(
            base_url="https://models.inference.ai.azure.com",
            api_key=os.getenv("GITHUB_TOKEN")
        )
        response = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )
        return response.choices[0].message.content
        
    elif model_id == "llama-3.3-70b-versatile":
        from openai import OpenAI
        client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY")
        )
        response = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )
        return response.choices[0].message.content
        
    elif model_id == "command-r-08-2024":
        import cohere
        client = cohere.ClientV2(os.getenv("COHERE_API_KEY"))
        response = client.chat(
            model=model_id,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.message.content[0].text
        
    else:
        raise ValueError(f"Unknown model_id: {model_id}")


def _parse_json_response(raw: str) -> list[dict]:
    """
    Safely parse a JSON array from Gemini's text output.
    Gemini sometimes wraps JSON in markdown code fences — we
    strip those before parsing.
    """
    # Remove ```json ... ``` or ``` ... ``` wrappers if present
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`").strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Failed to parse Gemini JSON response: {e}\n"
            f"Raw response (first 500 chars): {raw[:500]}"
        )
    if not isinstance(parsed, list):
        raise ValueError(
            f"Expected a JSON array from Gemini, got: {type(parsed)}"
        )
    return parsed


# ── Step 1: Generator Agent ──────────────────────────────────

GENERATOR_PROMPT_TEMPLATE = """
You are an expert academic quiz designer specialising in anti-plagiarism assessment.

Your task is to generate {num_variants} variants of a quiz based strictly on the context provided below.
Each variant must have {questions_each} multiple-choice questions.

STRATEGY: Use "Mirroring." Question 1 in Variant A must test the same concept as Question 1 in Variant B, but use different wording, different numerical values, or different distractors to prevent cheating.

Parameters:
  - Topic focus   : {topic_focus}
  - Bloom level   : {bloom_level}
  - Difficulty    : {difficulty}
  - Question type : {question_type}

Rules:
  1. Every question MUST be answerable using ONLY the provided context.
  2. Each question must test a DIFFERENT concept or sub-topic across the variant.
  3. For MCQ: provide exactly 4 options (A–D) with exactly one correct answer.
  4. For Short Answer: provide a concise model answer (1–2 sentences).
  5. Questions must vary in wording structure — do not repeat sentence patterns.
  6. Spread questions evenly across the context — do not focus only on the opening paragraphs.

Context retrieved from course material:
---
{context}
---

Return ONLY a FLATTENED 1D valid JSON array containing exactly {total_questions} questions (the sum of all variants).
Do NOT group them in separate arrays or objects.
No markdown fences, no preamble, no commentary. Pure JSON array only.
Each element must follow this exact schema:
{{
  "question"      : "...",
  "options"       : ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correct_answer": "A. ...",
  "bloom_level"   : "{bloom_level}",
  "difficulty"    : "{difficulty}",
  "question_type" : "{question_type}"
}}

For Short Answer questions set "options" to [] and put the model answer in "correct_answer".
""".strip()


def run_generator_agent(
    context: str,
    topic_focus: str,
    bloom_level: str,
    difficulty: str,
    question_type: str,
    num_variants: int,
    questions_each: int,
    model_id: str = "gemini-2.5-flash",
) -> list[dict]:
    """
    Step 1: Call LLM to generate mirrored candidate questions.
    """
    total_questions = num_variants * questions_each
    prompt = GENERATOR_PROMPT_TEMPLATE.format(
        num_variants=num_variants,
        questions_each=questions_each,
        total_questions=total_questions,
        topic_focus=topic_focus,
        bloom_level=bloom_level,
        difficulty=difficulty,
        question_type=question_type,
        context=context,
    )
    raw = _call_llm(model_id, prompt)
    questions = _parse_json_response(raw)
    print(f"[Generator Agent] Produced {len(questions)} candidate questions via {model_id}.")
    return questions


# ── Step 2: Evaluator / Judge Agent ─────────────────────────

EVALUATOR_PROMPT_TEMPLATE = """
You are a strict academic quality-control judge for quiz questions.

You will be given a JSON array of candidate questions and the original source
context they were supposedly generated from.

Your task: FILTER OUT any question that fails at least one of these criteria:
  1. GROUNDED    — The question AND its correct answer must be directly
                   supported by the provided context. Remove hallucinated questions.
  2. UNIQUE      — No two questions in the final list should test the same fact
                   or concept. Remove the weaker duplicate.
  3. ANSWERABLE  — The correct answer must unambiguously be the right answer
                   given the options provided (MCQ) or the context (Short Answer).
  4. WELL-FORMED — The question must be grammatically correct and unambiguous.

Original context:
---
{context}
---

Candidate questions (JSON array):
{questions_json}

Return ONLY the filtered JSON array of APPROVED questions.
Use the EXACT same schema as the input — do not modify any field values.
No markdown fences, no preamble, no commentary. Pure JSON only.
""".strip()


def run_evaluator_agent(
    questions: list[dict],
    context: str,
    model_id: str = "gemini-2.5-flash",
) -> list[dict]:
    """
    Step 2: Pass the generated questions through a second LLM prompt that
    acts as a judge, removing hallucinated or duplicate questions.
    """
    questions_json = json.dumps(questions, indent=2, ensure_ascii=False)
    prompt = EVALUATOR_PROMPT_TEMPLATE.format(
        context=context,
        questions_json=questions_json,
    )
    raw = _call_llm(model_id, prompt)
    validated = _parse_json_response(raw)
    print(
        f"[Evaluator Agent] {len(questions)} in → {len(validated)} validated questions out."
    )
    return validated


# ── RAG context retrieval helper ─────────────────────────────

def retrieve_context_from_qdrant(
    document_id: int,
    topic_focus: str,
    top_k: int = 6,
) -> str:
    """
    Query Qdrant for the top-k most relevant chunks for this
    document and topic, then concatenate them into a single
    context string for the Gemini prompts.

    This is called by the Celery quiz task — not directly by FastAPI.
    """
    from sentence_transformers import SentenceTransformer
    from core.qdrant_setup import get_qdrant_client
    from qdrant_client.http.models import Filter, FieldCondition, MatchValue
    from core.config import settings as cfg

    # Load the same model used at ingestion time
    model = SentenceTransformer("all-MiniLM-L6-v2")
    query_vector = model.encode(topic_focus).tolist()

    client = get_qdrant_client()
    results = client.search(
        collection_name=cfg.qdrant_collection_name,
        query_vector=query_vector,
        limit=top_k,
        query_filter=Filter(
            must=[
                FieldCondition(
                    key="document_id",
                    match=MatchValue(value=document_id),
                )
            ]
        ),
        with_payload=True,
    )

    chunks = [hit.payload.get("text", "") for hit in results if hit.payload]
    if not chunks:
        raise ValueError(
            f"No chunks found in Qdrant for document_id={document_id}. "
            "Ensure the document has been processed first."
        )

    return "\n\n".join(chunks)
