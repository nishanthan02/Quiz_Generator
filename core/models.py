# core/models.py
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, Float, Enum as SQLEnum, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.dialects.postgresql import JSONB
import enum

Base = declarative_base()

class UserRole(str, enum.Enum):
    faculty = "faculty"
    student = "student"
    admin = "admin"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.student, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    managed_subjects = relationship("Subject", back_populates="faculty")
    enrollments = relationship("StudentEnrollment", back_populates="student")
    attempts = relationship("StudentAttempt", back_populates="student")


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    faculty_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    faculty = relationship("User", back_populates="managed_subjects")
    documents = relationship("Document", back_populates="subject", cascade="all, delete-orphan")
    quizzes = relationship("Quiz", back_populates="subject", cascade="all, delete-orphan")
    enrollments = relationship("StudentEnrollment", back_populates="subject", cascade="all, delete-orphan")


class StudentEnrollment(Base):
    __tablename__ = "student_enrollments"

    student_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), primary_key=True)
    enrolled_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("User", back_populates="enrollments")
    subject = relationship("Subject", back_populates="enrollments")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    filename = Column(String, nullable=False)
    minio_path = Column(String, nullable=False)
    status = Column(String, nullable=False, default='pending')
    error_msg = Column(Text)
    # Detection metadata — populated by the Celery document task.
    # doc_type: "digital_unicode" | "scanned" | "legacy_font"
    # language:  "english" | "tamil" | "mixed" | "unknown"
    # Both are nullable so pre-existing rows remain valid.
    doc_type = Column(String, nullable=True)
    language = Column(String, nullable=True)
    declared_language = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    subject = relationship("Subject", back_populates="documents")


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(String)
    status = Column(String, nullable=False, default='draft') # 'draft' | 'published'
    
    # AI Generation context fields (optional for manual quizzes)
    topic_focus = Column(String)
    bloom_level = Column(String)
    difficulty = Column(String)
    
    # AI Analytics
    model_name = Column(String)
    generation_metrics = Column(JSONB)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    subject = relationship("Subject", back_populates="quizzes")
    questions = relationship("Question", back_populates="quiz", cascade="all, delete-orphan")
    attempts = relationship("StudentAttempt", back_populates="quiz", cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    question_type = Column(String, nullable=False, default='mcq') # 'mcq', 'true_false', etc.
    marks = Column(Float, default=1.0)
    
    quiz = relationship("Quiz", back_populates="questions")
    options = relationship("Option", back_populates="question", cascade="all, delete-orphan")


class Option(Base):
    __tablename__ = "options"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    option_text = Column(String, nullable=False)
    is_correct = Column(Boolean, default=False, nullable=False)

    question = relationship("Question", back_populates="options")


class StudentAttempt(Base):
    __tablename__ = "student_attempts"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    score = Column(Float)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)

    student = relationship("User", back_populates="attempts")
    quiz = relationship("Quiz", back_populates="attempts")
    answers = relationship("AttemptAnswer", back_populates="attempt", cascade="all, delete-orphan")


class AttemptAnswer(Base):
    __tablename__ = "attempt_answers"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("student_attempts.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    selected_option_id = Column(Integer, ForeignKey("options.id"))
    
    attempt = relationship("StudentAttempt", back_populates="answers")
    question = relationship("Question")
    selected_option = relationship("Option")


class StudentFeedback(Base):
    __tablename__ = "student_feedback"
    __table_args__ = (
        UniqueConstraint("quiz_id", "student_id", name="uq_feedback_quiz_student"),
    )

    id = Column(Integer, primary_key=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ai_text = Column(Text, nullable=True)       # raw LLM output
    final_text = Column(Text, nullable=True)    # approved/edited text
    status = Column(String, default="pending")  # pending|ready|approved|skipped|failed
    error_msg = Column(Text, nullable=True)     # reason if status=failed
    seen = Column(Boolean, default=False)       # cleared only via POST /mark-seen
    created_at = Column(DateTime, default=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)

    quiz = relationship("Quiz")
    student = relationship("User")
