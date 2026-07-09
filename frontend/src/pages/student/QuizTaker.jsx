import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

export default function QuizTaker() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // Mock Data mimicking the secure API response (NO is_correct fields)
  const quiz = {
    id: 1,
    title: 'Pipelining and Hazards',
    questions: [
      {
        id: 101,
        question_text: 'What kind of hazard occurs when an instruction depends on the result of a previous instruction still in the pipeline?',
        marks: 1.0,
        options: [
          { id: 201, option_text: 'Structural Hazard' },
          { id: 202, option_text: 'Data Hazard' },
          { id: 203, option_text: 'Control Hazard' },
        ],
      },
      {
         id: 102,
         question_text: 'Branch prediction is a technique primarily used to minimize which type of hazard?',
         marks: 1.0,
         options: [
           { id: 204, option_text: 'Data Hazard' },
           { id: 205, option_text: 'Control Hazard' },
           { id: 206, option_text: 'Structural Hazard' },
         ]
      }
    ],
  };

  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [scoreData, setScoreData] = useState(null);

  const handleSelect = (qId, oId) => {
    if (submitted) return;
    setAnswers({ ...answers, [qId]: oId });
  };

  const submitQuiz = () => {
    // In a real app, this sends `answers` payload to POST /learning/quizzes/{id}/attempts
    // Here we just mock the returned score response
    setSubmitted(true);
    setScoreData({
      score: 2.0,
      total: 2.0,
      message: 'Great job!'
    });
  };

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
           disabled={Object.keys(answers).length < quiz.questions.length}
           className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
         >
           Submit Attempt
         </button>
      </div>
    </div>
  );
}
