import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: '', description: '' });
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState(null);

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    try {
      const data = await api.getSubjects();
      setSubjects(data);
    } catch (err) {
      toast.error('Failed to fetch notebooks');
    }
  };

  const handleCreateSubject = async (e) => {
    e.preventDefault();
    try {
      await api.createSubject(newSubject);
      toast.success('Notebook created successfully');
      setIsModalOpen(false);
      setNewSubject({ name: '', description: '' });
      fetchSubjects();
    } catch (err) {
      toast.error('Failed to create notebook');
    }
  };

  const handleEditClick = (e, subject) => {
    e.stopPropagation();
    setEditingSubject(subject);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (e, subject) => {
    e.stopPropagation();
    setDeletingSubject(subject);
    setIsDeleteModalOpen(true);
  };

  const handleUpdateSubject = async (e) => {
    e.preventDefault();
    try {
      await api.updateSubject(editingSubject.id, {
        name: editingSubject.name,
        description: editingSubject.description
      });
      toast.success('Notebook updated successfully');
      setIsEditModalOpen(false);
      setEditingSubject(null);
      fetchSubjects();
    } catch (err) {
      toast.error('Failed to update notebook');
    }
  };

  const handleDeleteSubject = async () => {
    try {
      await api.deleteSubject(deletingSubject.id);
      toast.success('Notebook deleted successfully');
      setIsDeleteModalOpen(false);
      setDeletingSubject(null);
      fetchSubjects();
    } catch (err) {
      toast.error('Failed to delete notebook');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4 border-slate-200">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Notebooks</h1>
          <p className="mt-2 text-sm text-slate-500">
            Welcome back, {user?.name}. Create subjects, upload context documents, and generate quizzes for your cohorts.
          </p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Subject</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {subjects.map(sub => (
          <div 
            key={sub.id} 
            className="group relative bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer"
            onClick={() => navigate(`/faculty/subject/${sub.id}`)}
          >
            <div className="absolute top-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={(e) => handleEditClick(e, sub)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Edit Notebook"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button 
                onClick={(e) => handleDeleteClick(e, sub)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete Notebook"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <div className="bg-indigo-50 p-3 rounded-lg group-hover:bg-indigo-100 transition-colors">
                <BookOpen className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{sub.name}</h3>
                <p className="text-sm text-slate-500">{sub.description}</p>
              </div>
            </div>
          </div>
        ))}
        {subjects.length === 0 && (
           <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
             No Subjects Found. Create your first notebook!
           </div>
        )}
      </div>

      {/* Basic Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-slate-800">Create New Subject</h2>
            <form onSubmit={handleCreateSubject}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Subject Name</label>
                  <input required type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2" value={newSubject.name} onChange={e => setNewSubject({...newSubject, name: e.target.value})} placeholder="e.g. Advanced AI" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description / Identifier</label>
                  <input required type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2" value={newSubject.description} onChange={e => setNewSubject({...newSubject, description: e.target.value})} placeholder="e.g. Fall 2026 CS 500" />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-slate-800">Edit Notebook</h2>
            <form onSubmit={handleUpdateSubject}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Subject Name</label>
                  <input required type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2" value={editingSubject?.name || ''} onChange={e => setEditingSubject({...editingSubject, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description / Identifier</label>
                  <input required type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2" value={editingSubject?.description || ''} onChange={e => setEditingSubject({...editingSubject, description: e.target.value})} />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button type="button" onClick={() => {setIsEditModalOpen(false); setEditingSubject(null);}} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-slate-800">Delete Notebook</h2>
            <p className="text-slate-600 mb-6">
              Are you sure you want to delete <span className="font-semibold">{deletingSubject?.name}</span>? This action cannot be undone and will delete all associated documents and quizzes.
            </p>
            <div className="flex justify-end space-x-3">
              <button type="button" onClick={() => {setIsDeleteModalOpen(false); setDeletingSubject(null);}} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="button" onClick={handleDeleteSubject} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
