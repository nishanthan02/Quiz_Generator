# routers/management.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import List, Optional
from core.database import get_async_db
from core.models import User, Subject, Quiz, Question, Option, Document, StudentAttempt
from routers.auth_router import get_current_faculty

router = APIRouter(prefix="/management", tags=["management"])

# --- Schemas ---
class SubjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class SubjectResponse(SubjectCreate):
    id: int
    faculty_id: int
    class Config:
        from_attributes = True

class OptionCreate(BaseModel):
    option_text: str
    is_correct: bool

class QuestionCreate(BaseModel):
    question_text: str
    question_type: str = "mcq"
    marks: float = 1.0
    options: List[OptionCreate]

class QuizCreate(BaseModel):
    subject_id: int
    title: str
    description: Optional[str] = None
    status: str = "draft"
    questions: Optional[List[QuestionCreate]] = []

class QuizUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class BulkOptionUpdate(BaseModel):
    option_text: str
    is_correct: bool

class BulkQuestionUpdate(BaseModel):
    question_text: str
    question_type: str = "mcq"
    marks: float = 1.0
    options: List[BulkOptionUpdate]

class QuizBulkUpdate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str
    questions: List[BulkQuestionUpdate]

class QuizGenerateRequest(BaseModel):
    document_id: int
    topic_focus: str
    bloom_level: str
    difficulty: str
    question_type: str
    num_variants: int = 1
    questions_each: int = 10
    model_id: str = "gemini-2.5-flash"

# --- Endpoints ---

@router.post("/subjects", response_model=SubjectResponse)
async def create_subject(
    subject: SubjectCreate, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    new_subject = Subject(**subject.model_dump(), faculty_id=current_user.id)
    db.add(new_subject)
    await db.commit()
    await db.refresh(new_subject)
    return new_subject

@router.get("/subjects", response_model=List[SubjectResponse])
async def list_faculty_subjects(
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    result = await db.execute(select(Subject).where(Subject.faculty_id == current_user.id))
    return result.scalars().all()

class DocumentResponse(BaseModel):
    id: int
    filename: str
    status: str
    class Config:
        from_attributes = True

class QuizResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    model_name: Optional[str] = None
    class Config:
        from_attributes = True

class SubjectDetailResponse(SubjectResponse):
    documents: List[DocumentResponse] = []
    quizzes: List[QuizResponse] = []

class OptionDetailResponse(BaseModel):
    id: int
    option_text: str
    is_correct: bool
    class Config:
        from_attributes = True

class QuestionDetailResponse(BaseModel):
    id: int
    question_text: str
    question_type: str
    marks: float
    options: List[OptionDetailResponse] = []
    class Config:
        from_attributes = True

class QuizDetailResponse(QuizResponse):
    questions: List[QuestionDetailResponse] = []

@router.get("/subjects/{subject_id}", response_model=SubjectDetailResponse)
async def get_subject_detail(
    subject_id: int, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    # Need to load the documents and quizzes relationships
    result = await db.execute(
        select(Subject)
        .options(selectinload(Subject.documents), selectinload(Subject.quizzes))
        .where(Subject.id == subject_id, Subject.faculty_id == current_user.id)
    )
    subject = result.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject

@router.post("/quizzes")
async def create_quiz(
    quiz_in: QuizCreate, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    # Verify Subject ownership
    sub_res = await db.execute(select(Subject).where(Subject.id == quiz_in.subject_id, Subject.faculty_id == current_user.id))
    if not sub_res.scalars().first():
        raise HTTPException(status_code=404, detail="Subject not found or inaccessible")
    
    new_quiz = Quiz(
        subject_id=quiz_in.subject_id,
        title=quiz_in.title,
        description=quiz_in.description,
        status=quiz_in.status
    )
    db.add(new_quiz)
    await db.flush() # get new_quiz.id
    
    for q_in in quiz_in.questions:
        new_q = Question(
            quiz_id=new_quiz.id,
            question_text=q_in.question_text,
            question_type=q_in.question_type,
            marks=q_in.marks
        )
        db.add(new_q)
        await db.flush()
        
        for opt_in in q_in.options:
            new_opt = Option(
                question_id=new_q.id,
                option_text=opt_in.option_text,
                is_correct=opt_in.is_correct
            )
            db.add(new_opt)
            
    await db.commit()
    await db.refresh(new_quiz)
    return {"message": "Quiz created successfully", "quiz_id": new_quiz.id}

@router.post("/subjects/{subject_id}/documents", response_model=SubjectResponse)
async def upload_subject_document(
    subject_id: int, 
    file: UploadFile = File(...), 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    from services.minio_service import upload_document
    from workers.document_tasks import process_document

    result = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    subject = result.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
        
    # Enforce maximum of 5 documents across all subjects for this user
    from sqlalchemy import func
    total_docs_result = await db.execute(
        select(func.count(Document.id))
        .join(Subject, Subject.id == Document.subject_id)
        .where(Subject.faculty_id == current_user.id)
    )
    total_docs = total_docs_result.scalar() or 0
    if total_docs >= 5:
        raise HTTPException(
            status_code=400, 
            detail="You can upload a maximum of 5 documents across all subjects. Please delete an existing document before adding a new one."
        )

    # Read file bytes into memory
    file_bytes = await file.read()
    
    try:
        # Upload to MinIO (or fallback)
        minio_path = upload_document(file_bytes, file.filename)
    except Exception as e:
        # Gracefully handle missing MinIO configuration by saving to local tmp fallback
        import os, uuid
        os.makedirs("tmp_uploads", exist_ok=True)
        fallback_path = f"tmp_uploads/{uuid.uuid4()}_{file.filename}"
        with open(fallback_path, "wb") as f:
            f.write(file_bytes)
        minio_path = fallback_path
        
    new_doc = Document(
        subject_id=subject.id,
        filename=file.filename,
        minio_path=minio_path,
        status="pending" 
    )
    db.add(new_doc)
    await db.commit()
    await db.refresh(new_doc)
    
    # Trigger AI processing pipeline
    try:
        process_document.delay(new_doc.id, minio_path, file.filename)
    except Exception as e:
        # If celery is down, update status
        new_doc.status = "failed"
        new_doc.error_msg = str(e)
        await db.commit()
        
    return subject

@router.delete("/subjects/{subject_id}/documents/{document_id}")
async def delete_subject_document(
    subject_id: int, 
    document_id: int,
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    # Verify owner
    result = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    subject = result.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Find document
    doc_res = await db.execute(select(Document).where(Document.id == document_id, Document.subject_id == subject_id))
    doc = doc_res.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await db.delete(doc)
    await db.commit()
    return {"message": "Document deleted successfully"}

@router.put("/subjects/{subject_id}", response_model=SubjectResponse)
async def update_subject(
    subject_id: int, 
    subject_in: SubjectUpdate, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    result = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    subject = result.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found or inaccessible")
        
    update_data = subject_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(subject, key, value)
        
    await db.commit()
    await db.refresh(subject)
    return subject

@router.delete("/subjects/{subject_id}")
async def delete_subject(
    subject_id: int, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    result = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    subject = result.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
        
    await db.delete(subject)
    await db.commit()
    return {"message": "Subject deleted successfully"}

@router.get("/quizzes/{quiz_id}", response_model=QuizDetailResponse)
async def get_quiz_detail(
    quiz_id: int, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    result = await db.execute(
        select(Quiz)
        .join(Subject)
        .options(selectinload(Quiz.questions).selectinload(Question.options))
        .where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    quiz = result.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz

@router.put("/quizzes/{quiz_id}")
async def update_quiz(
    quiz_id: int, 
    quiz_in: QuizUpdate, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    result = await db.execute(
        select(Quiz).join(Subject).where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    quiz = result.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or unauthorized")
        
    update_data = quiz_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(quiz, key, value)
        
    await db.commit()
    return {"message": "Quiz updated successfully"}

@router.put("/quizzes/{quiz_id}/bulk")
async def bulk_update_quiz(
    quiz_id: int, 
    quiz_in: QuizBulkUpdate, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    # Verify owner
    result = await db.execute(
        select(Quiz).join(Subject).where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    quiz = result.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Update metadata
    quiz.title = quiz_in.title
    quiz.description = quiz_in.description
    quiz.status = quiz_in.status

    # Delete options for these questions first to satisfy FK constraints
    await db.execute(
        Option.__table__.delete().where(
            Option.question_id.in_(
                select(Question.id).where(Question.quiz_id == quiz_id)
            )
        )
    )
    # Delete existing questions
    await db.execute(
        Question.__table__.delete().where(Question.quiz_id == quiz_id)
    )
    await db.flush()

    # Insert new ones
    for q_in in quiz_in.questions:
        new_q = Question(
            quiz_id=quiz.id,
            question_text=q_in.question_text,
            question_type=q_in.question_type,
            marks=q_in.marks
        )
        db.add(new_q)
        await db.flush()
        
        for opt_in in q_in.options:
            new_opt = Option(
                question_id=new_q.id,
                option_text=opt_in.option_text,
                is_correct=opt_in.is_correct
            )
            db.add(new_opt)

    await db.commit()
    return {"message": "Quiz questions updated successfully"}

@router.delete("/quizzes/{quiz_id}")
async def delete_quiz(
    quiz_id: int, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    result = await db.execute(
        select(Quiz).join(Subject).where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    quiz = result.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or unauthorized")
        
    await db.delete(quiz)
    await db.commit()
    return {"message": "Quiz deleted successfully"}


@router.get("/subjects/{subject_id}/gradebook")
async def get_gradebook(
    subject_id: int, 
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    # Ensure faculty owns subject
    sub_res = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    if not sub_res.scalars().first():
         raise HTTPException(status_code=403, detail="Not authorized")

    # Fetch attempts for all quizzes in this subject
    # This is a basic aggregate view
    result = await db.execute(
        select(StudentAttempt)
        .join(Quiz, Quiz.id == StudentAttempt.quiz_id)
        .options(selectinload(StudentAttempt.student), selectinload(StudentAttempt.quiz))
        .where(Quiz.subject_id == subject_id)
    )
    attempts = result.scalars().all()
    
    return [
        {
            "attempt_id": a.id,
            "student_name": a.student.name,
            "quiz_title": a.quiz.title,
            "score": a.score,
            "completed_at": a.completed_at
        } for a in attempts
    ]

@router.post("/subjects/{subject_id}/generate-quiz")
async def generate_quiz_for_subject(
    subject_id: int, 
    req: QuizGenerateRequest,
    db: AsyncSession = Depends(get_async_db), 
    current_user: User = Depends(get_current_faculty)
):
    from workers.quiz_tasks import generate_quiz_variants

    result = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    subject = result.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Ensure document exists and is complete
    doc_res = await db.execute(select(Document).where(Document.id == req.document_id, Document.subject_id == subject_id))
    doc = doc_res.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found inside this subject")
    if doc.status != "complete":
        raise HTTPException(status_code=400, detail="Document must finish processing before generating a quiz.")

    new_quiz = Quiz(
        subject_id=subject.id,
        title=f"AI Quiz: {req.topic_focus}",
        description=f"Generated from {doc.filename}",
        topic_focus=req.topic_focus,
        bloom_level=req.bloom_level,
        difficulty=req.difficulty,
        status="generating"
    )
    db.add(new_quiz)
    await db.commit()
    await db.refresh(new_quiz)

    # Queue generation task
    try:
        generate_quiz_variants.delay(
            job_id=new_quiz.id,  # passing the Quiz ID so worker can update its status
            document_id=req.document_id,
            topic_focus=req.topic_focus,
            bloom_level=req.bloom_level,
            difficulty=req.difficulty,
            question_type=req.question_type,
            num_variants=req.num_variants,
            questions_each=req.questions_each,
            model_id=req.model_id
        )
    except Exception as e:
        new_quiz.status = "failed"
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"message": "Quiz generation started", "quiz_id": new_quiz.id}
