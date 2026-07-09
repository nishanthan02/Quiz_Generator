# routers/quizzes_router.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
from core.database import get_async_db
from core.models import QuizJob, Subject, User
from routers.auth_router import get_current_user
from routers.subjects_router import get_subject

router = APIRouter(prefix="/subjects/{subject_id}/quizzes", tags=["quizzes"])

class QuizCreateManual(BaseModel):
    topic_focus: str
    bloom_level: str
    difficulty: str
    question_type: str
    num_variants: int = 1
    questions_each: int
    quiz_data: list[Any] 

class QuizUpdate(BaseModel):
    quiz_data: list[Any]

class QuizResponse(BaseModel):
    id: int
    subject_id: int
    topic_focus: str
    bloom_level: str
    difficulty: str
    question_type: str
    num_variants: int
    questions_each: int
    status: str
    quiz_data: Optional[list[Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("", response_model=List[QuizResponse])
async def get_quizzes(subject_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    await get_subject(subject_id, current_user, db) # Verify subject access
    result = await db.execute(select(QuizJob).where(QuizJob.subject_id == subject_id))
    return result.scalars().all()

@router.post("", response_model=QuizResponse)
async def create_quiz_manual(subject_id: int, quiz_in: QuizCreateManual, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    await get_subject(subject_id, current_user, db) # Verify subject access
    
    quiz = QuizJob(
        subject_id=subject_id,
        user_id=str(current_user.id),
        topic_focus=quiz_in.topic_focus,
        bloom_level=quiz_in.bloom_level,
        difficulty=quiz_in.difficulty,
        question_type=quiz_in.question_type,
        num_variants=quiz_in.num_variants,
        questions_each=quiz_in.questions_each,
        status="complete", 
        quiz_data=quiz_in.quiz_data
    )
    db.add(quiz)
    await db.commit()
    await db.refresh(quiz)
    return quiz

@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(subject_id: int, quiz_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    await get_subject(subject_id, current_user, db) # Verify subject access
    result = await db.execute(select(QuizJob).where(QuizJob.id == quiz_id, QuizJob.subject_id == subject_id))
    quiz = result.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz

@router.put("/{quiz_id}", response_model=QuizResponse)
async def update_quiz(subject_id: int, quiz_id: int, update_in: QuizUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    quiz = await get_quiz(subject_id, quiz_id, current_user, db)
    quiz.quiz_data = update_in.quiz_data
    db.add(quiz)
    await db.commit()
    await db.refresh(quiz)
    return quiz

@router.delete("/{quiz_id}")
async def delete_quiz(subject_id: int, quiz_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    quiz = await get_quiz(subject_id, quiz_id, current_user, db)
    await db.delete(quiz)
    await db.commit()
    return {"status": "success"}
