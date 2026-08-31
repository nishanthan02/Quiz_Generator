import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BrainCircuit, CheckCircle } from 'lucide-react';
import { api, getApiErrorMessage } from '../../api/client';
import toast from 'react-hot-toast';

export default function StudentSubjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuizzes();
  }, [id]);

  const fetchQuizzes = async () => {
    try {
      const data = await api.getStudentSubjectQuizzes(id);
      setQuizzes(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load quizzes'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading subject...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 border-b pb-4 border-slate-200">
        <button onClick={() => navigate('/student/dashboard')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Subject Quizzes</h1>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 min-h-[400px]">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Available Quizzes</h2>
          
          <div className="space-y-3 pt-2">
            {quizzes.length === 0 ? (
              <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                No quizzes available for this subject.
              </div>
            ) : (
              quizzes.map(quiz => (
                <div 
                  key={quiz.id} 
                  onClick={() => navigate(`/student/quiz/${quiz.id}`)}
                  className="flex justify-between items-center p-4 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center space-x-4">
                    <div className="bg-indigo-100 p-2 rounded-lg">
                      <BrainCircuit className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">{quiz.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{quiz.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {quiz.attempted ? (
                      <span className="flex items-center text-sm font-medium text-green-600">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Score: {quiz.score} / {quiz.total_questions}
                      </span>
                    ) : (
                      <span className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 transition-colors">
                        Take Quiz
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
