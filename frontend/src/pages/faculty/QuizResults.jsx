import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { api, getApiErrorMessage } from '../../api/client';
import toast from 'react-hot-toast';

export default function QuizResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [quizData, resultsData] = await Promise.all([
        api.getQuiz(id),
        api.getQuizResults(id)
      ]);
      setQuiz(quizData);
      setResults(resultsData);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to fetch results'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading results...</div>;
  if (!quiz) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 border-b pb-4 border-slate-200">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{quiz.title} - Results</h1>
          <p className="text-sm text-slate-500 mt-1">Quiz ID: {quiz.id}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Student Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted At</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {results.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                  No students have attempted this quiz yet.
                </td>
              </tr>
            ) : (
              results.map(attempt => (
                <tr key={attempt.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{attempt.name || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{attempt.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-indigo-600">
                    {attempt.attempted ? `${attempt.score} / ${quiz.questions?.length}` : 'Not attempted'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {attempt.completed_at ? new Date(attempt.completed_at).toLocaleString() : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
