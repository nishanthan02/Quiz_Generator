import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileDown, FileSpreadsheet } from 'lucide-react';
import { api, getApiErrorMessage } from '../../api/client';
import toast from 'react-hot-toast';

export default function QuizResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null); // 'simple' | 'detailed' | null

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

  const triggerDownload = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleSimpleReport = async () => {
    setDownloading('simple');
    const toastId = toast.loading('Generating Simple Report...');
    try {
      const response = await api.downloadSimpleReport(id);
      triggerDownload(response.data, `${quiz.title}_simple_report.xlsx`);
      toast.success('Simple Report downloaded!', { id: toastId });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to download report'), { id: toastId });
    } finally {
      setDownloading(null);
    }
  };

  const handleDetailedReport = async () => {
    setDownloading('detailed');
    const toastId = toast.loading('Generating Detailed Report...');
    try {
      const response = await api.downloadDetailedReport(id);
      triggerDownload(response.data, `${quiz.title}_detailed_report.xlsx`);
      toast.success('Detailed Report downloaded!', { id: toastId });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to download report'), { id: toastId });
    } finally {
      setDownloading(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading results...</div>;
  if (!quiz) return null;

  const attempted = results.filter(r => r.attempted).length;
  const total = results.length;
  const totalMarks = quiz.questions?.reduce((sum, q) => sum + q.marks, 0) || quiz.questions?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4 border-slate-200">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{quiz.title} — Results</h1>
            <p className="text-sm text-slate-500 mt-1">{attempted} of {total} students attempted</p>
          </div>
        </div>

        {/* Download Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSimpleReport}
            disabled={!!downloading}
            className="flex items-center space-x-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            <span>{downloading === 'simple' ? 'Downloading...' : 'Simple Report'}</span>
          </button>
          <button
            onClick={handleDetailedReport}
            disabled={!!downloading}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{downloading === 'detailed' ? 'Downloading...' : 'Detailed Report'}</span>
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Student Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted At</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {results.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                  No students have attempted this quiz yet.
                </td>
              </tr>
            ) : (
              results.map((attempt, idx) => (
                <tr key={idx}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{attempt.name || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{attempt.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-indigo-600">
                    {attempt.attempted ? `${attempt.score} / ${totalMarks}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${attempt.attempted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {attempt.attempted ? 'Attempted' : 'Not Attempted'}
                    </span>
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
