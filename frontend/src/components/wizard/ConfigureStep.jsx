import React, { useState } from 'react';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import { Settings2, ArrowRight } from 'lucide-react';

export default function ConfigureStep({ documentId, onConfigured }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    topic_focus: '',
    bloom_level: 'Apply',
    difficulty: 'Medium',
    question_type: 'MCQ',
    num_variants: 3,
    questions_each: 5
  });

  const bloomLevels = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];
  const difficultyLevels = ["Easy", "Medium", "Hard"];
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ['num_variants', 'questions_each'].includes(name) ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.topic_focus.trim()) {
      toast.error("Please enter a topic focus.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        document_id: documentId,
        user_id: 'moodle_admin_123'
      };
      const result = await api.generateQuiz(payload);
      onConfigured(result.job_id);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || "Failed to start quiz generation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center mb-6">
        <Settings2 className="h-5 w-5 text-indigo-600 mr-2" />
        <h2 className="text-lg font-semibold text-slate-900">Step 3: Configure Generation Parameters</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="topic_focus" className="block text-sm font-medium leading-6 text-slate-900">
            Topic Focus
          </label>
          <div className="mt-2">
            <input
              type="text"
              name="topic_focus"
              id="topic_focus"
              value={formData.topic_focus}
              onChange={handleChange}
              placeholder="e.g. Newton's Third Law, Photosynthesis..."
              className="block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="bloom_level" className="block text-sm font-medium leading-6 text-slate-900">
              Bloom's Taxonomy Level
            </label>
            <select
              id="bloom_level"
              name="bloom_level"
              value={formData.bloom_level}
              onChange={handleChange}
              className="mt-2 block w-full rounded-md border-0 py-2 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
            >
              {bloomLevels.map(level => <option key={level} value={level}>{level}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium leading-6 text-slate-900 mb-2">
              Difficulty
            </label>
            <div className="flex items-center space-x-4">
              {difficultyLevels.map(diff => (
                <label key={diff} className="flex items-center">
                  <input
                    type="radio"
                    name="difficulty"
                    value={diff}
                    checked={formData.difficulty === diff}
                    onChange={handleChange}
                    className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="ml-2 text-sm text-slate-700">{diff}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 border-t border-slate-100">
          <div>
            <label htmlFor="question_type" className="block text-sm font-medium leading-6 text-slate-900">
              Question Type
            </label>
            <select
              id="question_type"
              name="question_type"
              value={formData.question_type}
              onChange={handleChange}
              className="mt-2 block w-full rounded-md border-0 py-2 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
            >
              <option value="MCQ">Multiple Choice Header</option>
              <option value="Short Answer">Short Answer</option>
            </select>
          </div>

          <div>
            <label htmlFor="num_variants" className="block text-sm font-medium leading-6 text-slate-900">
              Quiz Variants
            </label>
            <input
              type="number"
              min="1" max="50"
              name="num_variants"
              id="num_variants"
              value={formData.num_variants}
              onChange={handleChange}
              className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            />
          </div>

          <div>
            <label htmlFor="questions_each" className="block text-sm font-medium leading-6 text-slate-900">
              Questions per Variant
            </label>
            <input
              type="number"
              min="1" max="30"
              name="questions_each"
              id="questions_each"
              value={formData.questions_each}
              onChange={handleChange}
              className="mt-2 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Starting Engine...' : 'Generate Quiz'}
            {!isSubmitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
