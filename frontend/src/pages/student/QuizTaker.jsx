import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api, getApiErrorMessage } from '../../api/client';
import toast from 'react-hot-toast';

export default function QuizTaker() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [scoreData, setScoreData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchQuiz();
  }, [id]);

  const fetchQuiz = async () => {
    try {
      const data = await api.getStudentQuiz(id);
      setQuiz(data);
      if (data.attempted) {
        setSubmitted(true);
        setScoreData({ score: data.score, total: data.total_questions });
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to fetch quiz'));
      navigate('/student/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (qId, oId) => {
    if (submitted) return;
    setAnswers({ ...answers, [qId]: oId });
  };

  const submitQuiz = async () => {
    setSubmitting(true);
    const toastId = toast.loading('Submitting quiz...');
    try {
      // API expects array of { question_id, selected_option_id }
      const payload = Object.entries(answers).map(([qId, oId]) => ({
        question_id: parseInt(qId, 10),
        selected_option_id: parseInt(oId, 10)
      }));
      
      const response = await api.submitQuiz(id, { answers: payload });
      setSubmitted(true);
      setScoreData({
        score: response.score,
        total: quiz.questions.length,
      });
      toast.success('Quiz submitted successfully!', { id: toastId });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to submit quiz'), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading quiz...</div>;
  if (!quiz) return null;

  if (submitted && scoreData) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white border border-slate-200 rounded-xl p-12 text-center shadow-lg">
        <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto mb-6" />
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Quiz Completed!</h2>
        <p className="text-slate-600 mb-8">Your attempt has been recorded in the system.</p>
        
        <div className="bg-slate-50 p-6 rounded-lg mb-8 inline-block min-w-[200px]">
          <div className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Final Score</div>
          <div className="text-4xl font-extrabold text-indigo-700">
            {scoreData.score} / {scoreData.total}
          </div>
        </div>

        <div>
          <button 
            onClick={() => navigate('/student/dashboard')}
            className="bg-slate-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="border-b pb-4 border-slate-200 flex justify-between items-end">
        <div>
           <div className="text-sm text-indigo-600 font-medium tracking-wider uppercase mb-1">Quiz #{id}</div>
           <h1 className="text-3xl font-bold tracking-tight text-slate-900">{quiz.title}</h1>
        </div>
        <div className="text-sm text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-md">
           {quiz.questions.length} Questions
        </div>
      </div>

      <div className="space-y-8">
        {quiz.questions.map((q, index) => (
          <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
               {index + 1}. {q.question_text}
               <span className="text-sm text-slate-400 font-normal ml-2">({q.marks} pts)</span>
            </h3>
            <div className="space-y-3">
              {q.options.map((opt) => {
                const isSelected = answers[q.id] === opt.id;
                return (
                  <div 
                    key={opt.id}
                    onClick={() => handleSelect(q.id, opt.id)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-indigo-600 outline-1 outline cursor-default bg-indigo-50/50' 
                        : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-indigo-600' : 'border-slate-300'}`}>
                         {isSelected && <div className="w-3 h-3 bg-indigo-600 rounded-full"></div>}
                      </div>
                      <span className={`font-medium ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                        {opt.option_text}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-4 border-t border-slate-200">
         <button 
           onClick={submitQuiz}
           disabled={submitting || Object.keys(answers).length < quiz.questions.length}
           className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
         >
           {submitting ? 'Submitting...' : 'Submit Attempt'}
         </button>
      </div>
    </div>
  );
}
