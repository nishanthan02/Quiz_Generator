# routers/subjects_router.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from typing import List
from datetime import datetime
from core.database import get_async_db
from core.models import Subject, User
from routers.auth_router import get_current_user

router = APIRouter(prefix="/subjects", tags=["subjects"])

class SubjectCreate(BaseModel):
    name: str
    description: str = ""

class SubjectResponse(BaseModel):
    id: int
    name: str
    description: str
    faculty_id: int
    created_at: datetime

    class Config:
        from_attributes = True

@router.get("", response_model=List[SubjectResponse])
async def get_subjects(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Subject).where(Subject.faculty_id == current_user.id))
    return result.scalars().all()

@router.post("", response_model=SubjectResponse)
async def create_subject(subject_in: SubjectCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    subject = Subject(
        name=subject_in.name,
        description=subject_in.description,
        faculty_id=current_user.id
    )
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject

@router.get("/{subject_id}", response_model=SubjectResponse)
async def get_subject(subject_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    subject = result.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject

@router.delete("/{subject_id}")
async def delete_subject(subject_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    subject = result.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    await db.delete(subject)
    await db.commit()
    return {"status": "success"}
