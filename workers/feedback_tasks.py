# workers/feedback_tasks.py
import logging
from core.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, queue='feedback')
def generate_student_feedback(self, quiz_id: int, student_id: int, feedback_id: int):
    import os
    from core.models import StudentFeedback, StudentAttempt, AttemptAnswer, Question, Option, Quiz

    from core.database import SyncSessionLocal

    Session = SyncSessionLocal

    with Session() as db:
        try:
            attempt = db.query(StudentAttempt).filter(
                StudentAttempt.student_id == student_id,
                StudentAttempt.quiz_id == quiz_id
            ).first()
            if not attempt:
                _mark_failed(db, feedback_id, 'NoAttemptError: Student has not attempted this quiz yet.')
                return

            quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
            questions = db.query(Question).filter(Question.quiz_id == quiz_id).all()

            question_map = {}
            for q in questions:
                options = db.query(Option).filter(Option.question_id == q.id).all()
                correct_opt = next((o for o in options if o.is_correct), None)
                question_map[q.id] = {
                    'text': _sanitize(q.question_text),
                    'correct_text': _sanitize(correct_opt.option_text) if correct_opt else 'N/A',
                    'options': {o.id: _sanitize(o.option_text) for o in options},
                    'marks': q.marks,
                }

            answers = db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()
            total_marks = sum(q['marks'] for q in question_map.values())
            score = attempt.score or 0.0
            wrong_list = []

            for ans in answers:
                q_data = question_map.get(ans.question_id)
                if not q_data:
                    continue
                chosen_text = q_data['options'].get(ans.selected_option_id, 'No answer') if ans.selected_option_id else 'No answer'
                if chosen_text != q_data['correct_text']:
                    wrong_list.append(f'- {q_data["text"][:120]} chose {chosen_text}, correct: {q_data["correct_text"]}')

            wrong_section = '\n'.join(wrong_list[:10]) if wrong_list else 'All answers were correct.'

            prompt = f'''You are an academic tutor giving brief, constructive feedback to a student.

Quiz: {_sanitize(quiz.title)}
Student score: {score}/{total_marks}
Wrong answers:
{wrong_section}

Write 3-4 sentences of clear, encouraging, and constructive feedback.
Focus on what they got wrong and how to improve. Do not repeat the score.
Do not use bullet points. Plain paragraph only.'''

            from services.ai_agents import _call_llm
            ai_text = _call_llm("gemini-2.5-flash", prompt).strip()

            feedback = db.query(StudentFeedback).filter(StudentFeedback.id == feedback_id).first()
            if feedback:
                feedback.ai_text = ai_text
                feedback.status = 'ready'
                db.commit()

        except Exception as e:
            safe_error = f'{type(e).__name__}: {str(e)[:300]}'
            logger.warning('Feedback generation failed [quiz=%s student=%s feedback=%s]: %s', quiz_id, student_id, feedback_id, safe_error)
            _mark_failed(db, feedback_id, safe_error)


def _mark_failed(db, feedback_id: int, error: str):
    from core.models import StudentFeedback
    fb = db.query(StudentFeedback).filter(StudentFeedback.id == feedback_id).first()
    if fb:
        fb.status = 'failed'
        fb.error_msg = error
        db.commit()


def _sanitize(text: str) -> str:
    if not text:
        return ''
    return ''.join(ch for ch in text if ch.isprintable() or ch in ('\n', '\t'))
