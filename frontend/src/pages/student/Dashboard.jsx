import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { api, getApiErrorMessage } from '../../api/client';
import toast from 'react-hot-toast';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [enrolledSubjects, setEnrolledSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    try {
      const data = await api.getStudentSubjects();
      setEnrolledSubjects(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to fetch enrolled subjects'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading subjects...</div>;

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
          {enrolledSubjects.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-500">
              You are not enrolled in any subjects yet.
            </div>
          ) : (
            enrolledSubjects.map(sub => (
              <div 
                key={sub.id} 
                className="group bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all relative overflow-hidden cursor-pointer"
                onClick={() => navigate(`/student/subject/${sub.id}`)}
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                <div className="flex items-center space-x-4 mb-4">
                  <div className="bg-indigo-50 p-3 rounded-lg">
                    <BookOpen className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{sub.name}</h3>
                    <p className="text-xs text-slate-500">{sub.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 border-t pt-4 border-slate-100">
                   <span className="text-sm font-medium text-slate-600">View Details</span>
                   <button 
                     onClick={(e) => {
                       e.stopPropagation();
                       navigate(`/student/subject/${sub.id}`);
                     }}
                     className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                   >
                     Open &rarr;
                   </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
