import React, { useState } from 'react';
import { api } from '../../api/client';
import toast from 'react-hot-toast';

export default function ConstructQuizModal({ isOpen, onClose, subjectId, documents, onQuizCreated }) {
  const [formData, setFormData] = useState({
    document_id: documents?.filter(d => d.status === 'complete')?.[0]?.id || '',
    topic_focus: '',
    bloom_level: 'Apply',
    difficulty: 'Medium',
    question_type: 'MCQ',
    num_variants: 1,
    questions_each: 5,
    model_id: 'gemini-2.5-flash'
  });
  
  React.useEffect(() => {
    if (isOpen) {
      const validDocs = documents?.filter(d => d.status === 'complete') || [];
      const currentValid = validDocs.find(d => String(d.id) === String(formData.document_id));
      if (!currentValid && validDocs.length > 0) {
        setFormData(prev => ({ ...prev, document_id: validDocs[0].id }));
      } else if (validDocs.length === 0) {
        setFormData(prev => ({ ...prev, document_id: '' }));
      }
    }
  }, [isOpen, documents]);
  
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const validDocuments = documents?.filter(d => d.status === 'complete') || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.document_id) {
      toast.error('Please select a processed document first.');
      return;
    }

    setIsGenerating(true);
    const toastId = toast.loading('Initiating AI Quiz Generation...');
    
    try {
      await api.generateSubjectQuiz(subjectId, {
        ...formData,
        document_id: parseInt(formData.document_id)
      });
      toast.success('Agent triggered successfully! Quiz is now generating.', { id: toastId });
      onQuizCreated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start AI generation.', { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Construct AI Quiz</h2>
            <p className="text-sm text-slate-500 mt-1">Configure the agent parameters to build your assessment.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar space-y-5">
          {validDocuments.length === 0 ? (
            <div className="bg-orange-50 border border-orange-200 text-orange-700 p-4 rounded-lg text-sm">
              You don't have any fully processed documents in this subject yet. Please upload a document and wait for it to be ready.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Source Document</label>
                <select 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.document_id}
                  onChange={(e) => setFormData({...formData, document_id: e.target.value})}
                  required
                >
                  {validDocuments.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.filename}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Topic Focus</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Backpropagation, Memory Hierarchy, etc."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.topic_focus}
                  onChange={(e) => setFormData({...formData, topic_focus: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">AI Model</label>
                <select 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                  value={formData.model_id}
                  onChange={(e) => setFormData({...formData, model_id: e.target.value})}
                  required
                >
                  <option value="gemini-2.5-flash">Google Gemini</option>
                  <option value="llama-3.3-70b-versatile">Groq Llama 3.3</option>
                  <option value="command-r-08-2024">Cohere Command R</option>
                  <option value="Mistral-small">GitHub Mistral</option>
                  <option value="gpt-4o-mini">GitHub GPT-4o-Mini</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Bloom's Taxonomy</label>
                  <select 
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.bloom_level}
                    onChange={(e) => setFormData({...formData, bloom_level: e.target.value})}
                  >
                    <option>Remember</option>
                    <option>Understand</option>
                    <option>Apply</option>
                    <option>Analyze</option>
                    <option>Evaluate</option>
                    <option>Create</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Difficulty</label>
                  <select 
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.difficulty}
                    onChange={(e) => setFormData({...formData, difficulty: e.target.value})}
                  >
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Question Type</label>
                  <select 
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={formData.question_type}
                    onChange={(e) => setFormData({...formData, question_type: e.target.value})}
                  >
                    <option>MCQ</option>
                    <option>Short Answer</option>
                  </select>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-slate-700 mb-1" title="Number of Variants">Variants</label>
                    <input 
                      type="number" 
                      min="1" max="10"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.num_variants}
                      onChange={(e) => setFormData({...formData, num_variants: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-slate-700 mb-1" title="Questions Per Variant">Questions</label>
                    <input 
                      type="number" 
                      min="1" max="50"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={formData.questions_each}
                      onChange={(e) => setFormData({...formData, questions_each: parseInt(e.target.value)})}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="mt-8 flex justify-end space-x-3 pt-4 border-t border-slate-100">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={validDocuments.length === 0 || isGenerating}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isGenerating ? 'Generating...' : 'Start Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
