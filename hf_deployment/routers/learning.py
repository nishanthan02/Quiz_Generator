# routers/learning.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from core.database import get_async_db
from core.models import User, Subject, StudentEnrollment, Quiz, Question, Option, StudentAttempt, AttemptAnswer
from routers.auth_router import get_current_student

router = APIRouter(prefix="/learning", tags=["learning"])

# --- Schemas ---

class OptionSecure(BaseModel):
    id: int
    option_text: str
    class Config:
         from_attributes = True

class QuestionSecure(BaseModel):
    id: int
    question_text: str
    question_type: str
    marks: float
    options: List[OptionSecure]
    class Config:
         from_attributes = True

class QuizSecureView(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    questions: List[QuestionSecure]
    class Config:
         from_attributes = True

class AttemptSubmission(BaseModel):
    answers: dict[int, int] # question_id -> option_id

# --- Endpoints ---

@router.get("/subjects")
async def list_available_subjects(
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_student)
):
    # Returns all subjects, indicating if enrolled
    subjects_res = await db.execute(select(Subject))
    all_subjects = subjects_res.scalars().all()
    
    enroll_res = await db.execute(select(StudentEnrollment).where(StudentEnrollment.student_id == current_user.id))
    enrolled_ids = {e.subject_id for e in enroll_res.scalars().all()}
    
    return [
        {
            "id": s.id, "name": s.name, "description": s.description, "enrolled": s.id in enrolled_ids
        } for s in all_subjects
    ]

@router.post("/subjects/{subject_id}/enroll")
async def enroll_in_subject(
    subject_id: int, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_student)
):
    enrollment = StudentEnrollment(student_id=current_user.id, subject_id=subject_id)
    db.add(enrollment)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Already enrolled or subject doesn't exist.")
    return {"message": "Enrolled successfully"}

@router.get("/quizzes/{quiz_id}", response_model=QuizSecureView)
async def get_quiz_for_student(
    quiz_id: int, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_student)
):
    # Check enrollment
    quiz_res = await db.execute(
        select(Quiz)
        .options(selectinload(Quiz.questions).selectinload(Question.options))
        .where(Quiz.id == quiz_id, Quiz.status == "published")
    )
    quiz = quiz_res.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or not published")
        
    enroll_res = await db.execute(
        select(StudentEnrollment).where(StudentEnrollment.subject_id == quiz.subject_id, StudentEnrollment.student_id == current_user.id)
    )
    if not enroll_res.scalars().first():
        raise HTTPException(status_code=403, detail="Must be enrolled in subject to view quiz.")
        
    return quiz # Pydantic QuizSecureView drops the is_correct flag


@router.post("/quizzes/{quiz_id}/attempts")
async def submit_quiz_attempt(
    quiz_id: int, 
    submission: AttemptSubmission,
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_student)
):
    # Grade the submission
    quiz_res = await db.execute(
        select(Quiz).options(selectinload(Quiz.questions).selectinload(Question.options)).where(Quiz.id == quiz_id)
    )
    quiz = quiz_res.scalars().first()
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    total_score = 0.0
    
    # Store attempt records
    attempt = StudentAttempt(student_id=current_user.id, quiz_id=quiz_id, completed_at=datetime.utcnow())
    db.add(attempt)
    await db.flush()
    
    for question in quiz.questions:
        selected_option_id = submission.answers.get(question.id)
        if selected_option_id:
            db.add(AttemptAnswer(attempt_id=attempt.id, question_id=question.id, selected_option_id=selected_option_id))
            
            # Check correctness
            correct_opt = next((o for o in question.options if o.is_correct), None)
            if correct_opt and correct_opt.id == selected_option_id:
                total_score += question.marks
                
    attempt.score = total_score
    await db.commit()
    
    return {"message": "Attempt submitted", "score": total_score, "attempt_id": attempt.id}
