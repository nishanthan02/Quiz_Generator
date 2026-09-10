import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileText, BrainCircuit, Users, Plus, UploadCloud, RefreshCw, Trash2, Download, FileDown, DatabaseZap } from 'lucide-react';
import { api, getApiErrorMessage } from '../../api/client';
import toast from 'react-hot-toast';
import ConstructQuizModal from '../../components/wizard/ConstructQuizModal';

export default function SubjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('documents');
  const [subject, setSubject] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [startPage, setStartPage] = useState('');
  const [endPage, setEndPage] = useState('');
  const fileInputRef = useRef(null);

  const [enrollForm, setEnrollForm] = useState({ name: '', email: '' });
  const [enrolling, setEnrolling] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const bulkInputRef = useRef(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    fetchSubjectDetail();
    fetchStudents();
    
    // Simple polling to catch celery background task completions
    const intervalId = setInterval(fetchSubjectDetail, 5000);
    return () => clearInterval(intervalId);
  }, [id]);

  const fetchStudents = async () => {
    try {
      const data = await api.getEnrolledStudents(id);
      setStudents(data);
    } catch (err) {
      console.error(err);
    }
  };

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

  const handleEnrollStudent = async (e) => {
    e.preventDefault();
    setEnrolling(true);
    const loadingToast = toast.loading('Enrolling student...');
    try {
      await api.enrollStudent(id, enrollForm);
      toast.success('Student enrolled successfully!', { id: loadingToast });
      setEnrollForm({ name: '', email: '' });
      fetchStudents();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to enroll student'), { id: loadingToast });
    } finally {
      setEnrolling(false);
    }
  };

  const handleBulkEnroll = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkUploading(true);
    setBulkResult(null);
    const loadingToast = toast.loading('Processing CSV...');
    try {
      const result = await api.bulkEnrollStudents(id, file);
      setBulkResult(result);
      toast.success(`Done! ${result.created} created, ${result.enrolled} enrolled.`, { id: loadingToast });
      fetchStudents();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to process CSV'), { id: loadingToast });
    } finally {
      setBulkUploading(false);
      if (bulkInputRef.current) bulkInputRef.current.value = '';
    }
  };

  const toggleStudent = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  const toggleAllStudents = (studentList) => {
    if (selectedStudents.length === studentList.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(studentList.map(s => s.id));
    }
  };

  const handleRemoveStudents = async () => {
    if (selectedStudents.length === 0) return;
    const confirmMsg = `Remove ${selectedStudents.length} student(s) from this subject?`;
    if (!window.confirm(confirmMsg)) return;
    setRemoving(true);
    const toastId = toast.loading(`Removing ${selectedStudents.length} student(s)...`);
    try {
      await api.removeStudents(id, selectedStudents);
      toast.success(`${selectedStudents.length} student(s) removed.`, { id: toastId });
      setSelectedStudents([]);
      fetchStudents();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to remove students'), { id: toastId });
    } finally {
      setRemoving(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const loadingToast = toast.loading('Uploading document...');
    try {
      const options = {};
      if (startPage) options.start_page = parseInt(startPage, 10);
      if (endPage) options.end_page = parseInt(endPage, 10);

      await api.uploadDocument(id, file, options);
      toast.success('Document uploaded successfully!', { id: loadingToast });
      fetchSubjectDetail(); // Refresh the list
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to upload document'), { id: loadingToast });
    } finally {
      setUploading(false);
      setStartPage('');
      setEndPage('');
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
      toast.error(getApiErrorMessage(err, 'Failed to delete document'), { id: deletingToast });
    }
  };

  const triggerBlobDownload = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDocumentDownloadRaw = async (doc) => {
    const loadingToast = toast.loading(`Downloading ${doc.filename}...`);
    try {
      const response = await api.downloadDocumentRaw(doc.id);
      triggerBlobDownload(response.data, doc.filename);
      toast.success('Raw file downloaded!', { id: loadingToast });
    } catch (err) {
      toast.error('Failed to download raw file', { id: loadingToast });
    }
  };

  const handleDocumentDownloadChunks = async (doc) => {
    const safeName = doc.filename.replace(/\.[^.]+$/, '').replace(/\s+/g, '_');
    const loadingToast = toast.loading('Fetching vector chunks...');
    try {
      const response = await api.downloadDocumentChunks(doc.id);
      triggerBlobDownload(response.data, `${safeName}_chunks.json`);
      toast.success('Vector chunks downloaded!', { id: loadingToast });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to download chunks'), { id: loadingToast });
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
      toast.error(getApiErrorMessage(err, 'Failed to delete quiz'), { id: deletingToast });
    }
  };

  const handlePublishQuiz = async (e, quizId) => {
    e.stopPropagation();
    const toastId = toast.loading('Publishing quiz...');
    try {
      await api.updateQuiz(quizId, { status: 'published' });
      toast.success('Quiz published successfully!', { id: toastId });
      fetchSubjectDetail();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to publish quiz'), { id: toastId });
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
      toast.error(getApiErrorMessage(err, 'Failed to download quiz'), { id: loadingToast });
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
        <button
          onClick={() => setActiveTab('students')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium text-sm transition-all ${activeTab === 'students' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <Users className="w-4 h-4" />
          <span>Students</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 min-h-[400px]">
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-800">Reference Documents</h2>
              
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Start Pg (opt)"
                    value={startPage}
                    onChange={(e) => setStartPage(e.target.value)}
                    className="w-28 text-sm border-slate-200 rounded-md focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-xs"
                    disabled={uploading}
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="End Pg (opt)"
                    value={endPage}
                    onChange={(e) => setEndPage(e.target.value)}
                    className="w-28 text-sm border-slate-200 rounded-md focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-xs"
                    disabled={uploading}
                  />
                </div>
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
                  <div key={doc.id} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors group">
                    <div className="flex items-center space-x-3">
                      <FileText className="w-5 h-5 text-indigo-500" />
                      <span className="font-medium text-slate-700">{doc.filename}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold capitalize ${
                        doc.status === 'complete'    ? 'bg-green-100 text-green-700'  :
                        doc.status === 'processing'  ? 'bg-blue-100 text-blue-700'    :
                        doc.status === 'failed'      ? 'bg-red-100 text-red-700'      :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {doc.status === 'processing' && <RefreshCw className="inline w-3 h-3 mr-1 animate-spin" />}
                        {doc.status}
                      </span>
                      {/* Download raw file — always available once uploaded */}
                      <button
                        onClick={() => handleDocumentDownloadRaw(doc)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Download original file"
                      >
                        <FileDown className="w-4 h-4" />
                      </button>
                      {/* Download vector chunks — only available after processing */}
                      <button
                        onClick={() => handleDocumentDownloadChunks(doc)}
                        disabled={doc.status !== 'complete'}
                        className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        title={doc.status === 'complete' ? 'Download vector chunks (JSON)' : 'Document must finish processing first'}
                      >
                        <DatabaseZap className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDocumentDelete(doc.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
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
                         quiz.status === 'published' ? 'bg-blue-100 text-blue-700' :
                         'bg-green-100 text-green-700'
                      }`}>
                        {quiz.status}
                      </span>
                      {(quiz.status === 'draft' || quiz.status === 'complete') && (
                        <button
                          onClick={(e) => handlePublishQuiz(e, quiz.id)}
                          className="text-sm bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition-colors"
                        >
                          Publish
                        </button>
                      )}
                      {quiz.status === 'published' && (
                        <Link
                          to={`/faculty/quiz/${quiz.id}/results`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-100 transition-colors"
                        >
                          View Results
                        </Link>
                      )}
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

        {activeTab === 'students' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Enrolled Students</h2>
                <p className="text-slate-500 text-sm">Manage student access to this subject's quizzes.</p>
              </div>
              {/* Bulk CSV Upload */}
              <div>
                <input
                  type="file"
                  accept=".csv"
                  ref={bulkInputRef}
                  onChange={handleBulkEnroll}
                  className="hidden"
                />
                <button
                  onClick={() => bulkInputRef.current?.click()}
                  disabled={bulkUploading}
                  className="flex items-center space-x-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>{bulkUploading ? 'Processing...' : 'Bulk Upload CSV'}</span>
                </button>
                <p className="text-xs text-slate-400 mt-1 text-right">CSV format: name, email</p>
              </div>
            </div>

            {/* Bulk Upload Result Summary */}
            {bulkResult && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Bulk Upload Summary</h3>
                  <button onClick={() => setBulkResult(null)} className="text-xs text-slate-400 hover:text-slate-600">Dismiss</button>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold">✓ {bulkResult.created} New accounts created & enrolled</span>
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-semibold">✓ {bulkResult.enrolled} Existing accounts enrolled</span>
                  <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-semibold">⚠ {bulkResult.already_enrolled} Already enrolled (skipped)</span>
                  {bulkResult.skipped > 0 && <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full font-semibold">⊘ {bulkResult.skipped} Skipped (invalid rows)</span>}
                  {bulkResult.errors > 0 && <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full font-semibold">✗ {bulkResult.errors} Errors</span>}
                </div>
                {/* Show per-row details only for skipped/errors */}
                {bulkResult.rows.filter(r => r.status === 'error' || r.status === 'skipped').map((r, i) => (
                  <p key={i} className="text-xs text-red-600">⚠ {r.email}: {r.reason}</p>
                ))}
              </div>
            )}
            
            <form onSubmit={handleEnrollStudent} className="flex gap-4 items-end bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={enrollForm.name}
                  onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="Student Name"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={enrollForm.email}
                  onChange={(e) => setEnrollForm({ ...enrollForm, email: e.target.value })}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="student@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={enrolling}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Enroll Student
              </button>
            </form>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {/* Remove Selected Bar — shows only when something is checked */}
              {selectedStudents.length > 0 && (
                <div className="flex items-center justify-between px-4 py-2 bg-red-50 border-b border-red-100">
                  <span className="text-sm text-red-700 font-medium">{selectedStudents.length} student(s) selected</span>
                  <button
                    onClick={handleRemoveStudents}
                    disabled={removing}
                    className="text-sm px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {removing ? 'Removing...' : `Remove Selected (${selectedStudents.length})`}
                  </button>
                </div>
              )}
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={students.length > 0 && selectedStudents.length === students.length}
                        onChange={() => toggleAllStudents(students)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Joined</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                        No students enrolled yet.
                      </td>
                    </tr>
                  ) : (
                    students.map(student => (
                      <tr
                        key={student.id}
                        className={selectedStudents.includes(student.id) ? 'bg-red-50' : 'hover:bg-slate-50'}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedStudents.includes(student.id)}
                            onChange={() => toggleStudent(student.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{student.name || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{student.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {student.created_at ? new Date(student.created_at).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
