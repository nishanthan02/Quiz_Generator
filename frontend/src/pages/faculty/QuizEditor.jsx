import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Trash2, CheckCircle2, Circle, Info } from 'lucide-react';
import { api } from '../../api/client';
import toast from 'react-hot-toast';

export default function QuizEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchQuiz();
  }, [id]);

  const fetchQuiz = async () => {
    try {
      const data = await api.getQuiz(id);
      setQuiz(data);
    } catch (err) {
      toast.error('Failed to load quiz details');
      navigate('/faculty/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const toastId = toast.loading('Saving quiz master bank...');
    try {
      const payload = {
        title: quiz.title,
        description: quiz.description || '',
        status: quiz.status,
        questions: quiz.questions.map(q => ({
          question_text: q.question_text,
          question_type: q.question_type || "mcq",
          marks: q.marks || 1.0,
          options: q.options.map(opt => ({
            option_text: opt.option_text,
            is_correct: opt.is_correct
          }))
        }))
      };
      
      await api.updateQuiz(id, payload);
      toast.success('Successfully updated quiz questions!', { id: toastId });
      navigate('/faculty/dashboard'); // Or go back to subject detail
    } catch (err) {
      toast.error('Failed to save quiz.', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const updateQuestionText = (qIndex, text) => {
    const updated = { ...quiz };
    updated.questions[qIndex].question_text = text;
    setQuiz(updated);
  };

  const updateOptionText = (qIndex, optIndex, text) => {
    const updated = { ...quiz };
    updated.questions[qIndex].options[optIndex].option_text = text;
    setQuiz(updated);
  };

  const setCorrectOption = (qIndex, optIndex) => {
    const updated = { ...quiz };
    // Set all others to false
    updated.questions[qIndex].options.forEach((opt, idx) => {
      opt.is_correct = (idx === optIndex);
    });
    setQuiz(updated);
  };

  const addOption = (qIndex) => {
    const updated = { ...quiz };
    updated.questions[qIndex].options.push({
      option_text: 'New Option',
      is_correct: false
    });
    setQuiz(updated);
  };

  const removeOption = (qIndex, optIndex) => {
    const updated = { ...quiz };
    updated.questions[qIndex].options.splice(optIndex, 1);
    setQuiz(updated);
  };

  const addQuestion = () => {
    const updated = { ...quiz };
    updated.questions.push({
      question_text: 'New Question',
      question_type: 'mcq',
      marks: 1.0,
      options: [
        { option_text: 'Option A', is_correct: true },
        { option_text: 'Option B', is_correct: false }
      ]
    });
    setQuiz(updated);
  };

  const removeQuestion = (qIndex) => {
    const updated = { ...quiz };
    updated.questions.splice(qIndex, 1);
    setQuiz(updated);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading quiz data...</div>;
  if (!quiz) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4 border-slate-200">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Quiz Editor</h1>
            <p className="mt-1 text-sm text-slate-500">Review and curate AI-generated master bank</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          <span>{saving ? 'Saving...' : 'Save Quiz'}</span>
        </button>
      </div>

      <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm border border-blue-200 mb-6 flex items-start space-x-3">
         <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
         <div>
           <strong className="font-semibold">Edit inline freely:</strong>
           <p className="mt-0.5 text-blue-700">There are no separate "Edit" buttons. You can edit questions, options, and metadata directly inside the fields below. Don't forget to click "Save Quiz" when you are done.</p>
         </div>
      </div>

      {/* Metadata Editor */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Quiz Title</label>
            <input 
              type="text" 
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
              value={quiz.title}
              onChange={e => setQuiz({...quiz, title: e.target.value})}
            />
          </div>
          <div className="flex space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
              <input 
                type="text" 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={quiz.description || ''}
                onChange={e => setQuiz({...quiz, description: e.target.value})}
              />
            </div>
            <div className="w-48">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
              <select 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none capitalize"
                value={quiz.status}
                onChange={e => setQuiz({...quiz, status: e.target.value})}
              >
                <option value="draft">Draft</option>
                <option value="generating">Generating</option>
                <option value="complete">Complete</option>
                <option value="approved">Approved</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-6">
        {quiz.questions?.map((q, qIndex) => (
          <div key={qIndex} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center">
              <span className="font-bold text-slate-700">Question {qIndex + 1}</span>
              <button 
                onClick={() => removeQuestion(qIndex)}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                title="Remove Question"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none resize-y min-h-[80px]"
                value={q.question_text}
                onChange={e => updateQuestionText(qIndex, e.target.value)}
                placeholder="Question text..."
              />
              
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Options</span>
                {q.options?.map((opt, optIndex) => (
                  <div key={optIndex} className={`flex items-center space-x-3 p-2 rounded-lg border transition-colors ${opt.is_correct ? 'border-green-300 bg-green-50' : 'border-transparent hover:bg-slate-50'}`}>
                    <button 
                      onClick={() => setCorrectOption(qIndex, optIndex)}
                      className={`shrink-0 transition-colors ${opt.is_correct ? 'text-green-600' : 'text-slate-300 hover:text-green-500'}`}
                    >
                      {opt.is_correct ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </button>
                    <input 
                      type="text"
                      className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-slate-800 p-1"
                      value={opt.option_text}
                      onChange={e => updateOptionText(qIndex, optIndex, e.target.value)}
                    />
                    <button 
                      onClick={() => removeOption(qIndex, optIndex)}
                      className="text-slate-400 hover:text-red-500 p-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                
                <button 
                  onClick={() => addOption(qIndex)}
                  className="flex items-center space-x-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 ml-1 mt-2"
                >
                  <Plus className="w-4 h-4" /> <span>Add Option</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mt-6">
        <button 
          onClick={addQuestion}
          className="flex-1 py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-semibold hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>Add Blank Question</span>
        </button>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          <span>{saving ? 'Saving...' : 'Save Quiz'}</span>
        </button>
      </div>

    </div>
  );
}
