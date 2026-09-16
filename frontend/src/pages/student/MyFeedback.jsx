import React, { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle, Clock } from 'lucide-react';
import { api, getApiErrorMessage } from '../../api/client';
import toast from 'react-hot-toast';

export default function MyFeedback() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
    try {
      const data = await api.getMyFeedback();
      setFeedbacks(data);
      // Mark all as seen now that student has explicitly opened this page
      await api.markFeedbackSeen();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load feedback'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading feedback...</div>;

  return (
    <div className="space-y-6">
      <div className="border-b pb-4 border-slate-200">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Feedback</h1>
        <p className="text-sm text-slate-500 mt-1">Feedback provided by your faculty after reviewing your quiz performance.</p>
      </div>

      {feedbacks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
          <MessageSquare className="w-12 h-12" />
          <p className="text-lg font-medium">No feedback yet</p>
          <p className="text-sm">Your faculty will share feedback after reviewing your quiz results.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedbacks.map((fb) => (
            <div
              key={fb.id}
              className="bg-white border rounded-xl p-5 space-y-3 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    {!fb.seen && (
                      <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-semibold">New</span>
                    )}
                    <h3 className="text-base font-semibold text-slate-800">{fb.quiz_title}</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{fb.subject_name}</p>
                </div>
                <div className="flex items-center space-x-1 text-xs text-slate-400">
                  <Clock className="w-3 h-3" />
                  <span>{fb.approved_at ? new Date(fb.approved_at).toLocaleDateString() : '-'}</span>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
                <p className="text-sm text-slate-700 leading-relaxed">{fb.final_text}</p>
              </div>
              <div className="flex items-center space-x-1 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" />
                <span>Reviewed and approved by faculty</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
