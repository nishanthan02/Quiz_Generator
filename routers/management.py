# routers/management.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import List, Optional
from core.database import get_async_db
from core.models import User, Subject, Quiz, Question, Option, Document, StudentAttempt
from routers.auth_router import get_current_faculty
from services.minio_service import upload_document
from workers.document_tasks import process_document

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
    current_user: User = Depends(get_current_faculty),
    doc_type: str | None = Form(default=None, description="Optional override: 'digital' | 'scanned' | 'legacy_tamil'"),
    language: str | None = Form(default="auto", description="Optional override: 'english' | 'tamil' | 'mixed' | 'auto'"),
    model_id: str = Form(default="gemini-2.5-flash", description="Vision LLM used if OCR is needed"),
    start_page: int | None = Form(default=None, description="Optional start page for extraction (1-indexed)"),
    end_page: int | None = Form(default=None, description="Optional end page for extraction (1-indexed)"),
):
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

    # Validate optional doc_type value
    _VALID_DOC_TYPES = {"digital", "scanned", "legacy_tamil"}
    if doc_type and doc_type not in _VALID_DOC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid doc_type '{doc_type}'. Must be one of: {sorted(_VALID_DOC_TYPES)}"
        )

    # Validate optional language value
    _VALID_LANGUAGES = {"english", "tamil", "mixed", "auto"}
    if language and language not in _VALID_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid language '{language}'. Must be one of: {sorted(_VALID_LANGUAGES)}"
        )

    if start_page is not None and start_page < 1:
        raise HTTPException(status_code=400, detail="start_page must be >= 1")
    if end_page is not None and end_page < 1:
        raise HTTPException(status_code=400, detail="end_page must be >= 1")
    if start_page is not None and end_page is not None and start_page > end_page:
        raise HTTPException(status_code=400, detail="start_page cannot be greater than end_page")

    # Read file bytes into memory
    file_bytes = await file.read()
    
    # If a page range was requested, crop the file BEFORE storing it to save space
    from services.document_cropper import crop_document_bytes
    file_bytes = crop_document_bytes(file_bytes, file.filename, start_page, end_page)
    
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
        declared_language=language,
        doc_type=doc_type,
        status="pending" 
    )
    db.add(new_doc)
    await db.commit()
    await db.refresh(new_doc)
    
    # Trigger AI processing pipeline.
    # NOTE: start_page / end_page are NOT passed to the worker because the file
    # stored in MinIO is already cropped to the requested page range.
    # Passing the original range again would cause the worker to re-crop an
    # already-cropped file, producing wrong results or empty text.
    try:
        process_document.delay(
            new_doc.id,
            minio_path,
            file.filename,
            model_id=model_id,
            doc_type=doc_type,
            language=language,
            start_page=None,
            end_page=None,
        )
    except Exception as e:
        # If celery is down, update status
        new_doc.status = "failed"
        new_doc.error_msg = str(e)
        await db.commit()
        
    return subject

# ── Document Download: Raw File ─────────────────────────────

@router.get("/documents/{document_id}/download/raw")
async def download_document_raw(
    document_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty),
):
    """
    Stream the original raw file (PDF/PPTX) back to the browser.
    - If uploaded while MinIO was running: fetches from MinIO (localhost:9000).
    - If uploaded while MinIO was down: reads from local tmp_uploads/ fallback.
    """
    from services.minio_service import download_document as minio_download
    import mimetypes

    # Verify the document belongs to this faculty's subject
    result = await db.execute(
        select(Document)
        .join(Subject, Subject.id == Document.subject_id)
        .where(Document.id == document_id, Subject.faculty_id == current_user.id)
    )
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        file_bytes = minio_download(doc.minio_path)
    except Exception as e:
        # Give a useful message so the developer knows exactly what failed
        if doc.minio_path.startswith("tmp_uploads/"):
            raise HTTPException(
                status_code=404,
                detail=f"Local file not found at '{doc.minio_path}'. "
                       "The file may have been deleted from the tmp_uploads folder.",
            )
        raise HTTPException(
            status_code=503,
            detail=(
                f"Cannot reach MinIO at '{doc.minio_path}'. "
                "MinIO is not running. Start it with: "
                "docker run -d -p 9000:9000 -e MINIO_ROOT_USER=minioadmin "
                "-e MINIO_ROOT_PASSWORD=minioadmin minio/minio server /data"
            ),
        )

    mime_type, _ = mimetypes.guess_type(doc.filename)
    mime_type = mime_type or "application/octet-stream"

    import io
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


# ── Document Download: Vector Chunks ─────────────────────────

@router.get("/documents/{document_id}/download/chunks")
async def download_document_chunks(
    document_id: int,
    include_vectors: bool = False,   # ?include_vectors=true to add 1024-dim floats
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty),
):
    """
    Fetch all text chunks stored in Qdrant for this document.

    By default only the chunk text is returned (fast, ~seconds).
    Pass ?include_vectors=true to also get the 1024-dim float vectors
    (this makes the request significantly slower for large documents).
    """
    from core.qdrant_setup import get_qdrant_client
    from core.config import settings
    from qdrant_client.http.models import Filter, FieldCondition, MatchValue

    # Verify the document belongs to this faculty's subject
    result = await db.execute(
        select(Document)
        .join(Subject, Subject.id == Document.subject_id)
        .where(Document.id == document_id, Subject.faculty_id == current_user.id)
    )
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        client = get_qdrant_client()
        points, _ = client.scroll(
            collection_name=settings.qdrant_collection_name,
            scroll_filter=Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            ),
            limit=10_000,
            with_payload=True,
            with_vectors=include_vectors,   # only fetch vectors when explicitly requested
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query Qdrant: {e}")

    if not points:
        raise HTTPException(
            status_code=404,
            detail="No vector chunks found for this document. It may still be processing.",
        )

    chunks_data = [
        {
            "chunk_index": p.payload.get("chunk_index"),
            "text": p.payload.get("text"),
            **(  {"vector": p.vector} if include_vectors else {}  ),
            "point_id": str(p.id),
        }
        for p in sorted(points, key=lambda p: p.payload.get("chunk_index", 0))
    ]

    export = {
        "document_id": document_id,
        "filename": doc.filename,
        "total_chunks": len(chunks_data),
        "include_vectors": include_vectors,
        "chunks": chunks_data,
    }

    import json
    json_bytes = json.dumps(export, indent=2, ensure_ascii=False).encode("utf-8")
    safe_name = doc.filename.rsplit(".", 1)[0].replace(" ", "_")
    suffix = "_chunks_with_vectors" if include_vectors else "_chunks"

    import io
    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}{suffix}.json"'},
    )


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
        
    if quiz.status == "published" and quiz_in.status != "published":
         # Prevent un-publishing if we want to be strict, or maybe allow it? We'll just lock edits.
         # Actually, we can just block editing details if it's already published.
         pass
         
    # If it was already published, block modifying anything EXCEPT status (maybe) or block everything.
    # Let's just say if it's published, they can't change title/description.
    if quiz.status == "published" and (quiz_in.title or quiz_in.description):
         raise HTTPException(status_code=400, detail="Cannot edit a published quiz.")

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

    if quiz.status == "published":
        raise HTTPException(status_code=400, detail="Cannot edit questions of a published quiz.")

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
        
    if quiz.status == "published":
        raise HTTPException(status_code=400, detail="Cannot delete a published quiz.")

    await db.delete(quiz)
    await db.commit()
    return {"message": "Quiz deleted successfully"}


# ── Students and Enrollments ─────────────────────────────

class EnrollRequest(BaseModel):
    email: str
    name: Optional[str] = "Student"

@router.post("/subjects/{subject_id}/enroll")
async def enroll_student(
    subject_id: int,
    req: EnrollRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    # Verify owner
    sub_res = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    if not sub_res.scalars().first():
        raise HTTPException(status_code=404, detail="Subject not found")

    # Find user by email
    user_res = await db.execute(select(User).where(User.email == req.email))
    student = user_res.scalars().first()

    status_msg = "enrolled"
    if student:
        if student.role == "faculty":
            raise HTTPException(status_code=409, detail="Cannot enroll a faculty member as a student.")
    else:
        # Create student with default password "student123"
        from core.security import get_password_hash
        from core.models import UserRole
        student = User(
            email=req.email,
            name=req.name,
            hashed_password=get_password_hash("student123"),
            role=UserRole.student
        )
        db.add(student)
        await db.flush()
        status_msg = "created"

    # Enroll
    from core.models import StudentEnrollment
    enroll_res = await db.execute(
        select(StudentEnrollment).where(
            StudentEnrollment.student_id == student.id, 
            StudentEnrollment.subject_id == subject_id
        )
    )
    if enroll_res.scalars().first():
        return {"status": "already_enrolled"}

    new_enrollment = StudentEnrollment(student_id=student.id, subject_id=subject_id)
    db.add(new_enrollment)
    await db.commit()
    return {"status": status_msg}


# ── Bulk Enroll via CSV ─────────────────────────────

@router.post("/subjects/{subject_id}/enroll/bulk")
async def bulk_enroll_students(
    subject_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    """
    Upload a CSV with columns: name, email
    Returns a summary of each row: created / enrolled / already_enrolled / skipped (faculty) / error
    """
    import csv, io
    from core.security import get_password_hash
    from core.models import UserRole, StudentEnrollment

    # Verify subject ownership
    sub_res = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    if not sub_res.scalars().first():
        raise HTTPException(status_code=404, detail="Subject not found")

    # Read and parse CSV
    contents = await file.read()
    try:
        text = contents.decode("utf-8-sig")  # utf-8-sig handles Excel BOM
    except UnicodeDecodeError:
        text = contents.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    # Normalize headers (strip whitespace, lowercase)
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV file appears to be empty.")

    normalized_fields = [f.strip().lower() for f in reader.fieldnames]
    if "email" not in normalized_fields:
        raise HTTPException(status_code=400, detail="CSV must have an 'email' column.")

    results = []
    for row in reader:
        # Normalize keys
        row = {k.strip().lower(): v.strip() for k, v in row.items()}
        email = row.get("email", "").strip()
        name = row.get("name", "").strip() or "Student"

        if not email:
            results.append({"email": email, "name": name, "status": "skipped", "reason": "Empty email"})
            continue

        try:
            # Find or create user
            user_res = await db.execute(select(User).where(User.email == email))
            student = user_res.scalars().first()
            row_status = "enrolled"

            if student:
                if student.role == UserRole.faculty:
                    results.append({"email": email, "name": name, "status": "skipped", "reason": "Is a faculty account"})
                    continue
            else:
                student = User(
                    email=email,
                    name=name,
                    hashed_password=get_password_hash("student123"),
                    role=UserRole.student
                )
                db.add(student)
                await db.flush()
                row_status = "created"

            # Check if already enrolled
            enroll_res = await db.execute(
                select(StudentEnrollment).where(
                    StudentEnrollment.student_id == student.id,
                    StudentEnrollment.subject_id == subject_id
                )
            )
            if enroll_res.scalars().first():
                results.append({"email": email, "name": student.name, "status": "already_enrolled"})
                continue

            db.add(StudentEnrollment(student_id=student.id, subject_id=subject_id))
            await db.flush()
            results.append({"email": email, "name": student.name, "status": row_status})

        except Exception as e:
            await db.rollback()
            results.append({"email": email, "name": name, "status": "error", "reason": str(e)})

    await db.commit()

    summary = {
        "total": len(results),
        "created": sum(1 for r in results if r["status"] == "created"),
        "enrolled": sum(1 for r in results if r["status"] == "enrolled"),
        "already_enrolled": sum(1 for r in results if r["status"] == "already_enrolled"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "errors": sum(1 for r in results if r["status"] == "error"),
        "rows": results
    }
    return summary


@router.get("/subjects/{subject_id}/students")
async def get_enrolled_students(
    subject_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    sub_res = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    if not sub_res.scalars().first():
        raise HTTPException(status_code=404, detail="Subject not found")

    from core.models import StudentEnrollment
    result = await db.execute(
        select(User)
        .join(StudentEnrollment, StudentEnrollment.student_id == User.id)
        .where(StudentEnrollment.subject_id == subject_id)
    )
    students = result.scalars().all()
    return [{"id": s.id, "name": s.name, "email": s.email, "created_at": s.created_at.isoformat() if s.created_at else None} for s in students]


class RemoveStudentsRequest(BaseModel):
    student_ids: List[int]

@router.delete("/subjects/{subject_id}/students")
async def remove_enrolled_students(
    subject_id: int,
    req: RemoveStudentsRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    """Remove one or more students from a subject's enrollment."""
    from core.models import StudentEnrollment

    # Verify subject ownership
    sub_res = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.faculty_id == current_user.id))
    if not sub_res.scalars().first():
        raise HTTPException(status_code=404, detail="Subject not found")

    # Delete enrollments for all given student IDs in one query
    await db.execute(
        StudentEnrollment.__table__.delete().where(
            StudentEnrollment.student_id.in_(req.student_ids),
            StudentEnrollment.subject_id == subject_id
        )
    )
    await db.commit()
    return {"removed": len(req.student_ids)}


@router.get("/quizzes/{quiz_id}/results")
async def get_quiz_results(
    quiz_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    result = await db.execute(
        select(Quiz).join(Subject).where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    quiz = result.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Get all students enrolled in this subject
    from core.models import StudentEnrollment
    students_res = await db.execute(
        select(User)
        .join(StudentEnrollment, StudentEnrollment.student_id == User.id)
        .where(StudentEnrollment.subject_id == quiz.subject_id)
    )
    enrolled_students = students_res.scalars().all()

    # Get attempts
    attempts_res = await db.execute(
        select(StudentAttempt).where(StudentAttempt.quiz_id == quiz_id)
    )
    attempts = {a.student_id: a for a in attempts_res.scalars().all()}

    results = []
    for s in enrolled_students:
        attempt = attempts.get(s.id)
        results.append({
            "student_id": s.id,
            "name": s.name,
            "email": s.email,
            "attempted": attempt is not None,
            "score": attempt.score if attempt else None,
            "completed_at": attempt.completed_at if attempt else None,
        })
    return results


# ── Excel Report: Simple (Name + Score) ─────────────────────────────

@router.get("/quizzes/{quiz_id}/report/simple")
async def download_simple_report(
    quiz_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    """Download a simple Excel report: Student Name, Email, Score, Status, Submitted At."""
    import io
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    from core.models import StudentEnrollment

    # Verify quiz ownership
    result = await db.execute(
        select(Quiz).join(Subject).where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    quiz = result.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Get total possible marks
    q_res = await db.execute(select(Question).where(Question.quiz_id == quiz_id))
    questions = q_res.scalars().all()
    total_marks = sum(q.marks for q in questions)

    # Get enrolled students
    students_res = await db.execute(
        select(User)
        .join(StudentEnrollment, StudentEnrollment.student_id == User.id)
        .where(StudentEnrollment.subject_id == quiz.subject_id)
    )
    enrolled_students = students_res.scalars().all()

    # Get attempts
    attempts_res = await db.execute(select(StudentAttempt).where(StudentAttempt.quiz_id == quiz_id))
    attempts = {a.student_id: a for a in attempts_res.scalars().all()}

    # Build Excel workbook
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Quiz Results"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
    center = Alignment(horizontal="center")

    headers = ["#", "Student Name", "Email", "Score", f"Out of ({total_marks})", "Percentage", "Status", "Submitted At"]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center

    for idx, s in enumerate(enrolled_students, 1):
        attempt = attempts.get(s.id)
        score = attempt.score if attempt else None
        pct = f"{(score / total_marks * 100):.1f}%" if (attempt and total_marks > 0) else "-"
        status = "Attempted" if attempt else "Not Attempted"
        submitted = attempt.completed_at.strftime("%d-%m-%Y %H:%M") if (attempt and attempt.completed_at) else "-"
        ws.append([idx, s.name or "N/A", s.email, score if score is not None else "-", total_marks, pct, status, submitted])

    for col in ws.columns:
        max_len = max((len(str(cell.value or "")) for cell in col), default=10)
        ws.column_dimensions[col[0].column_letter].width = max_len + 4

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    safe_title = quiz.title.replace(" ", "_")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}_simple_report.xlsx"'}
    )


# ── Excel Report: Detailed (Per Question Answer) ─────────────────────────────

@router.get("/quizzes/{quiz_id}/report/detailed")
async def download_detailed_report(
    quiz_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    """Download a detailed Excel report: each student's answer per question, marked correct/wrong."""
    import io
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    from core.models import StudentEnrollment, AttemptAnswer

    result = await db.execute(
        select(Quiz).join(Subject).where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    quiz = result.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Load questions + options
    q_res = await db.execute(
        select(Question)
        .options(selectinload(Question.options))
        .where(Question.quiz_id == quiz_id)
        .order_by(Question.id)
    )
    questions = q_res.scalars().all()
    total_marks = sum(q.marks for q in questions)

    option_map = {}
    for q in questions:
        for opt in q.options:
            option_map[opt.id] = opt

    # Get enrolled students
    students_res = await db.execute(
        select(User)
        .join(StudentEnrollment, StudentEnrollment.student_id == User.id)
        .where(StudentEnrollment.subject_id == quiz.subject_id)
    )
    enrolled_students = students_res.scalars().all()

    # Get attempts
    attempts_res = await db.execute(select(StudentAttempt).where(StudentAttempt.quiz_id == quiz_id))
    attempt_map = {a.student_id: a for a in attempts_res.scalars().all()}

    # Get all answers for this quiz grouped by attempt
    answers_res = await db.execute(
        select(AttemptAnswer)
        .join(StudentAttempt, StudentAttempt.id == AttemptAnswer.attempt_id)
        .where(StudentAttempt.quiz_id == quiz_id)
    )
    answers_by_attempt = {}
    for ans in answers_res.scalars().all():
        answers_by_attempt.setdefault(ans.attempt_id, {})[ans.question_id] = ans

    # Build workbook
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Detailed Results"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
    green_fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
    red_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")

    fixed_headers = ["#", "Student Name", "Email", "Total Score", f"Out of ({total_marks})", "Percentage", "Status"]
    q_headers = [f"Q{i+1}: {q.question_text[:40]}..." if len(q.question_text) > 40 else f"Q{i+1}: {q.question_text}" for i, q in enumerate(questions)]
    ws.append(fixed_headers + q_headers)

    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill

    for idx, s in enumerate(enrolled_students, 1):
        attempt = attempt_map.get(s.id)
        score = attempt.score if attempt else None
        pct = f"{(score / total_marks * 100):.1f}%" if (attempt and total_marks > 0) else "-"
        status = "Attempted" if attempt else "Not Attempted"

        row = [idx, s.name or "N/A", s.email, score if score is not None else "-", total_marks, pct, status]

        if attempt:
            student_answers = answers_by_attempt.get(attempt.id, {})
            for q in questions:
                ans = student_answers.get(q.id)
                if ans:
                    selected_opt = option_map.get(ans.selected_option_id)
                    row.append(f"{'✓' if selected_opt and selected_opt.is_correct else '✗'} {selected_opt.option_text if selected_opt else 'N/A'}")
                else:
                    row.append("Not answered")
        else:
            row += ["-"] * len(questions)

        ws.append(row)

        # Color-code answer cells: green = correct, red = wrong
        if attempt:
            student_answers = answers_by_attempt.get(attempt.id, {})
            for col_idx, q in enumerate(questions, start=len(fixed_headers) + 1):
                ans = student_answers.get(q.id)
                cell = ws.cell(row=ws.max_row, column=col_idx)
                if ans:
                    selected_opt = option_map.get(ans.selected_option_id)
                    cell.fill = green_fill if (selected_opt and selected_opt.is_correct) else red_fill

    for col in ws.columns:
        max_len = max((len(str(cell.value or "")) for cell in col), default=10)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 50)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    safe_title = quiz.title.replace(" ", "_")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}_detailed_report.xlsx"'}
    )


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


# ── AI Feedback System ─────────────────────────────────────

from sqlalchemy.dialects.postgresql import insert as pg_insert

class FeedbackGenerateRequest(BaseModel):
    student_ids: Optional[List[int]] = None
    score_threshold: Optional[float] = None

@router.post("/quizzes/{quiz_id}/feedback/generate")
async def generate_feedback(
    quiz_id: int,
    req: FeedbackGenerateRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    from core.models import StudentFeedback, StudentAttempt, Subject
    from workers.feedback_tasks import generate_student_feedback

    # Verify quiz ownership
    quiz_res = await db.execute(
        select(Quiz).join(Subject).where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    quiz = quiz_res.scalars().first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Determine students to process
    query = select(StudentAttempt).where(StudentAttempt.quiz_id == quiz_id)
    if req.student_ids:
        query = query.where(StudentAttempt.student_id.in_(req.student_ids))
    
    attempts_res = await db.execute(query)
    attempts = attempts_res.scalars().all()

    students_to_process = []
    if req.score_threshold is not None:
        total_marks = sum(q.marks for q in quiz.questions) if quiz.questions else 1
        for a in attempts:
            pct = (a.score / total_marks) * 100 if total_marks else 0
            if pct < req.score_threshold:
                students_to_process.append(a.student_id)
    else:
        students_to_process = [a.student_id for a in attempts]

    if not students_to_process:
        return {"queued": 0, "skipped": 0, "message": "No students matched criteria"}

    if len(students_to_process) > 200:
        raise HTTPException(status_code=400, detail="Cannot generate for more than 200 students at once.")

    # Atomic upsert — Postgres ON CONFLICT DO UPDATE with RETURNING
    stmt = pg_insert(StudentFeedback).values([
        {"quiz_id": quiz_id, "student_id": sid, "status": "pending", "error_msg": None}
        for sid in students_to_process
    ]).on_conflict_do_update(
        index_elements=["quiz_id", "student_id"],
        set_={"status": "pending", "error_msg": None},
        where=(StudentFeedback.status == "failed")   # skip ready/approved/pending
    ).returning(StudentFeedback.id, StudentFeedback.student_id)

    result = await db.execute(stmt)
    newly_pending = result.fetchall()
    await db.commit()

    # Queue Celery tasks ONLY for rows that came back from RETURNING
    for feedback_id, student_id in newly_pending:
        generate_student_feedback.delay(quiz_id, student_id, feedback_id)

    return {
        "queued": len(newly_pending),
        "skipped": len(students_to_process) - len(newly_pending)
    }

@router.get("/quizzes/{quiz_id}/feedback/status")
async def get_feedback_status(
    quiz_id: int,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    from core.models import StudentFeedback, Subject
    # Verify owner
    quiz_res = await db.execute(
        select(Quiz).join(Subject).where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    if not quiz_res.scalars().first():
        raise HTTPException(status_code=404, detail="Quiz not found")

    fb_res = await db.execute(
        select(StudentFeedback).where(StudentFeedback.quiz_id == quiz_id)
    )
    feedbacks = fb_res.scalars().all()
    
    return [
        {
            "id": f.id,
            "student_id": f.student_id,
            "status": f.status,
            "ai_text": f.ai_text,
            "final_text": f.final_text,
            "error_msg": f.error_msg
        } for f in feedbacks
    ]

class ReviewItem(BaseModel):
    student_id: int
    action: str  # "approve" | "skip"
    edited_text: Optional[str] = None

class FeedbackReviewRequest(BaseModel):
    reviews: List[ReviewItem]

@router.post("/quizzes/{quiz_id}/feedback/review")
async def review_feedback(
    quiz_id: int,
    req: FeedbackReviewRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    from core.models import StudentFeedback, Subject
    from datetime import datetime
    
    # Verify owner
    quiz_res = await db.execute(
        select(Quiz).join(Subject).where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    if not quiz_res.scalars().first():
        raise HTTPException(status_code=404, detail="Quiz not found")

    student_ids = [r.student_id for r in req.reviews]
    fb_res = await db.execute(
        select(StudentFeedback).where(
            StudentFeedback.quiz_id == quiz_id, 
            StudentFeedback.student_id.in_(student_ids)
        )
    )
    feedbacks = {f.student_id: f for f in fb_res.scalars().all()}

    for item in req.reviews:
        fb = feedbacks.get(item.student_id)
        if not fb:
            continue
        if item.action == "approve":
            fb.status = "approved"
            fb.final_text = item.edited_text or fb.ai_text
            fb.approved_at = datetime.utcnow()
        elif item.action == "skip":
            fb.status = "skipped"
        elif item.action == "delete":
            await db.delete(fb)
            
    await db.commit()
    return {"message": "Reviews processed"}


class RetryRequest(BaseModel):
    student_id: int

@router.post("/quizzes/{quiz_id}/feedback/retry")
async def retry_feedback(
    quiz_id: int,
    req: RetryRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_faculty)
):
    from core.models import StudentFeedback, Subject
    from workers.feedback_tasks import generate_student_feedback
    
    # Verify owner
    quiz_res = await db.execute(
        select(Quiz).join(Subject).where(Quiz.id == quiz_id, Subject.faculty_id == current_user.id)
    )
    if not quiz_res.scalars().first():
        raise HTTPException(status_code=404, detail="Quiz not found")

    fb_res = await db.execute(
        select(StudentFeedback).where(
            StudentFeedback.quiz_id == quiz_id,
            StudentFeedback.student_id == req.student_id
        )
    )
    fb = fb_res.scalars().first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback record not found")

    fb.status = "pending"
    fb.error_msg = None
    await db.commit()

    generate_student_feedback.delay(quiz_id, req.student_id, fb.id)
    return {"message": "Retried"}
