import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

export default function StudentDashboard() {
  const navigate = useNavigate();
  // Mock data
  const enrolledSubjects = [
    { id: 1, name: 'Advanced Computer Architecture', desc: 'Fall 2026 CS 405', progress: '3 Quizzes Pending' }
  ];

  return (
    <div className="space-y-6">
      <div className="border-b pb-4 border-slate-200">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Learning Hub</h1>
        <p className="mt-2 text-sm text-slate-500">
          Access your enrolled notebooks and take your assigned quizzes.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-800 mb-4">Enrolled Subjects</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {enrolledSubjects.map(sub => (
            <div 
              key={sub.id} 
              className="group bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
              <div className="flex items-center space-x-4 mb-4">
                <div className="bg-indigo-50 p-3 rounded-lg">
                  <BookOpen className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{sub.name}</h3>
                  <p className="text-xs text-slate-500">{sub.desc}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 border-t pt-4 border-slate-100">
                 <span className="text-sm font-medium text-amber-600">{sub.progress}</span>
                 <button 
                   onClick={() => navigate(`/student/quiz/1`)}
                   className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                 >
                   View Quizzes &rarr;
                 </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
