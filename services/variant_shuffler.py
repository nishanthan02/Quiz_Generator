# services/variant_shuffler.py
# ============================================================
# Pure-Python quiz variant shuffler — NO extra API calls.
#
# After the Generator + Evaluator agents produce a validated
# Master Bank of N questions, this module deals them into the
# requested number of quiz variants.
#
# Anti-cheat strategy:
#   Each variant gets a DIFFERENT random subset of questions
#   (if the bank is large enough) AND the MCQ options within
#   each question are independently shuffled.  Two students
#   sitting the same variant will see questions in a different
#   order, and the A/B/C/D labels for each question's options
#   will differ — defeating answer-sharing.
#
# Maths:
#   bank_size=40, questions_each=10, num_variants=30
#   C(40,10) ≈ 850 million possible subsets → effectively
#   guaranteed unique variants at practical scale.
# ============================================================

import random
import copy
from typing import Any


def shuffle_options(question: dict) -> dict:
    """
    Return a deep copy of an MCQ question with its A/B/C/D
    options shuffled and the correct_answer label updated to
    match the new position.

    For Short Answer questions (options=[]) this is a no-op.
    """
    q = copy.deepcopy(question)
    options = q.get("options", [])

    if not options:
        # Short Answer — nothing to shuffle
        return q

    correct = q.get("correct_answer", "")
    # Shuffle the option strings
    random.shuffle(options)
    q["options"] = options

    # Re-label A/B/C/D
    labels = ["A", "B", "C", "D"]
    labeled_options = []
    new_correct = correct  # fallback

    for i, opt_text in enumerate(options):
        # Strip any existing label prefix ("A. ", "B. ", etc.)
        stripped = opt_text.lstrip("ABCD").lstrip(". ").strip()
        label = labels[i] if i < len(labels) else str(i + 1)
        labeled = f"{label}. {stripped}"
        labeled_options.append(labeled)

        # Check if this was the correct answer (match on stripped text)
        correct_stripped = correct.lstrip("ABCD").lstrip(". ").strip()
        if stripped == correct_stripped:
            new_correct = labeled

    q["options"] = labeled_options
    q["correct_answer"] = new_correct
    return q


def build_variants(
    validated_bank: list[dict],
    num_variants: int,
    questions_each: int,
    seed: int | None = None,
) -> list[dict]:
    """
    Deal the validated Master Bank into `num_variants` quiz variants.

    Each variant:
      - Has exactly `questions_each` questions (or fewer if the bank
        is smaller — a warning is included in that case).
      - Draws a *different* random sample from the bank when the bank
        is large enough.
      - Has independently shuffled MCQ option order.

    Args:
        validated_bank:  Output of run_evaluator_agent().
        num_variants:    How many distinct quiz papers to create.
        questions_each:  Questions per variant paper.
        seed:            Optional random seed for reproducibility in tests.

    Returns:
        List of variant dicts:
        [
          {
            "variant_id":  1,
            "questions":   [ {...}, ... ]
          },
          ...
        ]
    """
    if seed is not None:
        random.seed(seed)

    bank_size = len(validated_bank)

    if bank_size == 0:
        raise ValueError(
            "The validated question bank is empty. "
            "The Evaluator agent removed all candidates — "
            "try a broader topic_focus or upload more material."
        )

    # Clamp questions_each to bank size with a clear warning
    if questions_each > bank_size:
        print(
            f"[Shuffler] WARNING: questions_each={questions_each} > "
            f"bank_size={bank_size}. Each variant will use all {bank_size} questions."
        )
        questions_each = bank_size

    variants: list[dict] = []

    for v in range(1, num_variants + 1):
        # Sample without replacement for this variant
        sample = random.sample(validated_bank, k=questions_each)

        # Shuffle question ORDER within the variant
        random.shuffle(sample)

        # Shuffle MCQ option ORDER within each question
        processed = [shuffle_options(q) for q in sample]

        variants.append(
            {
                "variant_id": v,
                "questions": processed,
            }
        )

    print(
        f"[Shuffler] Built {num_variants} variants × "
        f"{questions_each} questions from a bank of {bank_size}."
    )
    return variants
