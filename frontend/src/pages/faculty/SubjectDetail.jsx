import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, BrainCircuit, BarChart3, Plus, UploadCloud, RefreshCw, Trash2, Download } from 'lucide-react';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import ConstructQuizModal from '../../components/wizard/ConstructQuizModal';

export default function SubjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('documents');
  const [subject, setSubject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSubjectDetail();
    
    // Simple polling to catch celery background task completions
    const intervalId = setInterval(fetchSubjectDetail, 5000);
    return () => clearInterval(intervalId);
  }, [id]);

  const fetchSubjectDetail = async () => {
    try {
      const data = await api.getSubject(id);
      setSubject(data);
    } catch (err) {
      toast.error('Failed to load subject details');
      navigate('/faculty/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const loadingToast = toast.loading('Uploading document...');
    try {
      await api.uploadDocument(id, file);
      toast.success('Document uploaded successfully!', { id: loadingToast });
      fetchSubjectDetail(); // Refresh the list
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to upload document', { id: loadingToast });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDocumentDelete = async (docId) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this document?');
    if (!confirmDelete) return;

    const deletingToast = toast.loading('Deleting document...');
    try {
      await api.deleteDocument(id, docId);
      toast.success('Document deleted successfully!', { id: deletingToast });
      fetchSubjectDetail();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete document', { id: deletingToast });
    }
  };

  const handleQuizDelete = async (e, quizId) => {
    e.stopPropagation();
    const confirmDelete = window.confirm('Are you sure you want to delete this quiz?');
    if (!confirmDelete) return;

    const deletingToast = toast.loading('Deleting quiz...');
    try {
      await api.deleteQuiz(quizId);
      toast.success('Quiz deleted successfully!', { id: deletingToast });
      fetchSubjectDetail();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete quiz', { id: deletingToast });
    }
  };

  const handleQuizDownload = async (e, quiz) => {
    e.stopPropagation();
    const loadingToast = toast.loading('Preparing download...');
    try {
      const quizData = await api.getQuiz(quiz.id);
      
      let docName = "unknown_document";
      if (quiz.description && quiz.description.startsWith("Generated from ")) {
        docName = quiz.description.replace("Generated from ", "");
      }
      const modelName = quiz.model_name || "manual";
      const fileName = `${docName}_${modelName}`.replace(/\s+/g, '_');

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(quizData, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `${fileName}.json`);
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      toast.success('Download started!', { id: loadingToast });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to download quiz', { id: loadingToast });
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading subject...</div>;
  if (!subject) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4 border-b pb-4 border-slate-200">
        <button onClick={() => navigate('/faculty/dashboard')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{subject.name}</h1>
          <div className="flex items-center text-sm text-slate-500 space-x-2 mt-1">
            <span>Subject ID: {subject.id}</span>
            <span>&bull;</span>
            <span>{subject.description || 'No description provided'}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-max">
        <button
          onClick={() => setActiveTab('documents')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'documents' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <FileText className="w-4 h-4" />
          <span>Documents</span>
        </button>
        <button
          onClick={() => setActiveTab('quizzes')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'quizzes' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <BrainCircuit className="w-4 h-4" />
          <span>Quizzes</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 min-h-[400px]">
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-800">Reference Documents</h2>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload}
                className="hidden" 
                accept=".pdf,.pptx"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-sm bg-indigo-50 text-indigo-700 px-4 py-2 rounded-md font-medium hover:bg-indigo-100 transition-colors flex items-center disabled:opacity-50"
              >
                {uploading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                {uploading ? 'Uploading...' : 'Add Document'}
              </button>
            </div>
            <p className="text-slate-500 text-sm border-b pb-4 border-slate-100">
              Upload syllabus and slide decks here. The AI will use these as context generation.
            </p>
            
            {/* Document List */}
            <div className="space-y-3 pt-2">
              {subject.documents?.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  No documents uploaded yet.
                </div>
              ) : (
                subject.documents?.map(doc => (
                  <div key={doc.id} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center space-x-3">
                      <FileText className="w-5 h-5 text-indigo-500" />
                      <span className="font-medium text-slate-700">{doc.filename}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold capitalize">
                        {doc.status}
                      </span>
                      <button 
                        onClick={() => handleDocumentDelete(doc.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'quizzes' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-800">Available Quizzes</h2>
              <button 
                onClick={() => setIsQuizModalOpen(true)}
                className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-md font-medium hover:bg-indigo-700 transition-colors flex items-center"
              >
                <Plus className="w-4 h-4 mr-1" /> Construct Quiz
              </button>
            </div>
            
            <p className="text-slate-500 text-sm border-b pb-4 border-slate-100">
              Create quizzes manually or let the AI generate them based on the knowledge base.
            </p>

            <div className="space-y-3 pt-2">
              {subject.quizzes?.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  No quizzes have been created for this subject.
                </div>
              ) : (
                subject.quizzes?.map(quiz => (
                  <div 
                    key={quiz.id} 
                    onClick={() => navigate(`/faculty/quiz/${quiz.id}/edit`)}
                    className="flex justify-between items-center p-4 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group"
                  >
                    <div>
                      <h3 className="font-semibold text-slate-800">{quiz.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{quiz.description}</p>
                      {quiz.model_name && (
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">
                          Generated by: {quiz.model_name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${
                         quiz.status === 'generating' ? 'bg-amber-100 text-amber-700' :
                         quiz.status === 'failed' ? 'bg-red-100 text-red-700' :
                         'bg-green-100 text-green-700'
                      }`}>
                        {quiz.status}
                      </span>
                      <button 
                        onClick={(e) => handleQuizDownload(e, quiz)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Download Quiz as JSON"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleQuizDelete(e, quiz.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Delete Quiz"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}


      </div>

      <ConstructQuizModal 
         isOpen={isQuizModalOpen} 
         onClose={() => setIsQuizModalOpen(false)} 
         subjectId={id} 
         documents={subject.documents} 
         onQuizCreated={fetchSubjectDetail}
      />
    </div>
  );
}
