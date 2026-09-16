from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from core.database import get_async_db
from core.models import User, Subject, Quiz, Question, Option, StudentEnrollment, StudentAttempt, AttemptAnswer

# We need a get_current_student dependency
from routers.auth_router import get_current_user

async def get_current_student(current_user: User = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user


router = APIRouter(prefix="/student", tags=["student"])


# --- Schemas ---

class SubjectStudentResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    faculty_id: int
    class Config:
        from_attributes = True

class QuizStudentResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    attempted: bool = False
    score: Optional[float] = None
    class Config:
        from_attributes = True

class OptionStudentResponse(BaseModel):
    id: int
    option_text: str
    # Note: is_correct is intentionally omitted so students cannot cheat!
    class Config:
        from_attributes = True

class QuestionStudentResponse(BaseModel):
    id: int
    question_text: str
    question_type: str
    marks: float
    options: List[OptionStudentResponse] = []
    class Config:
        from_attributes = True

class QuizTakeResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    questions: List[QuestionStudentResponse] = []
    class Config:
        from_attributes = True

class AnswerSubmit(BaseModel):
    question_id: int
    selected_option_id: Optional[int] = None

class QuizSubmitRequest(BaseModel):
    answers: List[AnswerSubmit]


# --- Endpoints ---

@router.get("/subjects", response_model=List[SubjectStudentResponse])
async def list_enrolled_subjects(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_student)
):
    result = await db.execute(
        select(Subject)
        .join(StudentEnrollment)
        .where(StudentEnrollment.student_id == current_user.id)
    )
    return result.scalars().all()


@router.get("/subjects/{subject_id}/quizzes", response_model=List[QuizStudentResponse])
async def list_subject_quizzes(
    subject_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_student)
):
    # Verify enrollment
    enroll_res = await db.execute(
        select(StudentEnrollment).where(
            StudentEnrollment.student_id == current_user.id,
            StudentEnrollment.subject_id == subject_id
        )
    )
    if not enroll_res.scalars().first():
        raise HTTPException(status_code=403, detail="Not enrolled in this subject")

    # Fetch published quizzes
    quizzes_res = await db.execute(
        select(Quiz).where(
            Quiz.subject_id == subject_id,
            Quiz.status == "published"
        )
    )
    quizzes = quizzes_res.scalars().all()

    # Fetch user's attempts
    attempts_res = await db.execute(
        select(StudentAttempt).where(StudentAttempt.student_id == current_user.id)
    )
    attempts = {a.quiz_id: a for a in attempts_res.scalars().all()}

    results = []
    for q in quizzes:
        attempt = attempts.get(q.id)
        results.append({
            "id": q.id,
            "title": q.title,
            "description": q.description,
            "status": q.status,
            "attempted": attempt is not None,
            "score": attempt.score if attempt else None
        })
    return results


@router.get("/quizzes/{quiz_id}", response_model=QuizTakeResponse)
async def get_quiz_to_take(
    quiz_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_student)
):
    # Fetch quiz with subject
    quiz_res = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions).selectinload(Question.options))
        .where(Quiz.id == quiz_id, Quiz.status == "published")
    )
    quiz = quiz_res.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or not published")

    # Verify enrollment in the quiz's subject
    enroll_res = await db.execute(
        select(StudentEnrollment).where(
            StudentEnrollment.student_id == current_user.id,
            StudentEnrollment.subject_id == quiz.subject_id
        )
    )
    if not enroll_res.scalars().first():
        raise HTTPException(status_code=403, detail="Not enrolled in the subject for this quiz")

    return quiz


@router.post("/quizzes/{quiz_id}/submit")
async def submit_quiz(
    quiz_id: int,
    req: QuizSubmitRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_student)
):
    # Fetch quiz with subject
    quiz_res = await db.execute(
        select(Quiz).where(Quiz.id == quiz_id, Quiz.status == "published")
    )
    quiz = quiz_res.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or not published")

    # Verify enrollment
    enroll_res = await db.execute(
        select(StudentEnrollment).where(
            StudentEnrollment.student_id == current_user.id,
            StudentEnrollment.subject_id == quiz.subject_id
        )
    )
    if not enroll_res.scalars().first():
        raise HTTPException(status_code=403, detail="Not enrolled in the subject for this quiz")

    # Verify IDEMPOTENCY: Check if attempt already exists
    attempt_res = await db.execute(
        select(StudentAttempt).where(
            StudentAttempt.student_id == current_user.id,
            StudentAttempt.quiz_id == quiz_id
        )
    )
    if attempt_res.scalars().first():
        raise HTTPException(status_code=409, detail="You have already submitted an attempt for this quiz.")

    # Fetch all questions and options for server-side scoring
    questions_res = await db.execute(
        select(Question)
        .options(selectinload(Question.options))
        .where(Question.quiz_id == quiz_id)
    )
    questions = questions_res.scalars().all()
    
    # Map questions and correct options
    question_map = {}
    for q in questions:
        correct_opt = next((o for o in q.options if o.is_correct), None)
        question_map[q.id] = {
            "marks": q.marks,
            "correct_option_id": correct_opt.id if correct_opt else None
        }

    # Calculate score
    total_score = 0.0
    
    # Create Attempt
    new_attempt = StudentAttempt(
        student_id=current_user.id,
        quiz_id=quiz_id,
        completed_at=datetime.utcnow()
    )
    db.add(new_attempt)
    await db.flush()

    for ans in req.answers:
        q_data = question_map.get(ans.question_id)
        if not q_data:
            continue # Skip invalid questions
        
        is_correct = (ans.selected_option_id == q_data["correct_option_id"])
        if is_correct:
            total_score += q_data["marks"]

        # Record answer
        db.add(AttemptAnswer(
            attempt_id=new_attempt.id,
            question_id=ans.question_id,
            selected_option_id=ans.selected_option_id
        ))

    new_attempt.score = total_score
    await db.commit()

    return {"message": "Quiz submitted successfully", "score": total_score}


# ── AI Feedback System ─────────────────────────────────────

@router.get("/feedback")
async def get_my_feedback(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_student)
):
    from core.models import StudentFeedback
    
    result = await db.execute(
        select(StudentFeedback, Quiz.title.label("quiz_title"), Subject.name.label("subject_name"), StudentAttempt.score)
        .join(Quiz, Quiz.id == StudentFeedback.quiz_id)
        .join(Subject, Subject.id == Quiz.subject_id)
        .join(StudentAttempt, (StudentAttempt.quiz_id == StudentFeedback.quiz_id) & (StudentAttempt.student_id == StudentFeedback.student_id))
        .where(StudentFeedback.student_id == current_user.id, StudentFeedback.status == "approved")
        .order_by(StudentFeedback.approved_at.desc())
    )
    
    feedbacks = result.all()
    return [
        {
            "id": f.StudentFeedback.id,
            "quiz_id": f.StudentFeedback.quiz_id,
            "quiz_title": f.quiz_title,
            "subject_name": f.subject_name,
            "score": f.score,
            "final_text": f.StudentFeedback.final_text,
            "approved_at": f.StudentFeedback.approved_at,
            "seen": f.StudentFeedback.seen
        } for f in feedbacks
    ]

@router.get("/feedback/unread-count")
async def get_feedback_unread_count(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_student)
):
    from core.models import StudentFeedback
    result = await db.execute(
        select(StudentFeedback).where(
            StudentFeedback.student_id == current_user.id,
            StudentFeedback.status == "approved",
            StudentFeedback.seen == False
        )
    )
    return {"count": len(result.scalars().all())}

@router.post("/feedback/mark-seen")
async def mark_feedback_seen(
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_student)
):
    from core.models import StudentFeedback
    from sqlalchemy import update
    await db.execute(
        update(StudentFeedback)
        .where(StudentFeedback.student_id == current_user.id, StudentFeedback.status == "approved")
        .values(seen=True)
    )
    await db.commit()
    return {"message": "All marked seen"}
