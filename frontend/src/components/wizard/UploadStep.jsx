import React, { useCallback, useState } from 'react';
import { UploadCloud, File, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import toast from 'react-hot-toast';

export default function UploadStep({ onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const processFile = async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'pptx'].includes(ext)) {
      toast.error('Only .pdf and .pptx files are supported.');
      return;
    }
    
    setIsUploading(true);
    try {
      // Mocking User ID for this proof of concept
      const userId = 'moodle_admin_123';
      const result = await api.uploadDocument(file, userId);
      toast.success('File uploaded successfully!');
      
      // Dispatch custom event for Document Library in App.jsx
      const docEvent = new CustomEvent('document_added', {
        detail: {
          document_id: result.document_id,
          filename: file.name,
          status: result.status,
          created_at: new Date().toISOString(),
          error_msg: null
        }
      });
      window.dispatchEvent(docEvent);
      
      onUploadSuccess(result.document_id);
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload file. Check CORS or backend connection.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold text-slate-900 mb-1">Step 1: Upload Source Material</h2>
      <p className="text-sm text-slate-500 mb-6">Drag and drop your course syllabus, slides, or textbook chapter.</p>
      
      <div 
        className={cn(
          "relative mt-2 flex justify-center rounded-xl border-2 border-dashed px-6 py-16 transition-all duration-200",
          isDragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-slate-400",
          isUploading && "opacity-75 cursor-not-allowed pointer-events-none"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="text-center">
          {isUploading ? (
            <Loader2 className="mx-auto h-12 w-12 text-indigo-500 animate-spin" />
          ) : (
            <UploadCloud className={cn("mx-auto h-12 w-12", isDragging ? "text-indigo-500" : "text-slate-300")} aria-hidden="true" />
          )}
          
          <div className="mt-4 flex text-sm leading-6 text-slate-600 justify-center">
            <label
              htmlFor="file-upload"
              className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500"
            >
              <span>{isUploading ? 'Uploading...' : 'Upload a file'}</span>
              <input 
                id="file-upload" 
                name="file-upload" 
                type="file" 
                className="sr-only" 
                accept=".pdf,.pptx"
                onChange={handleChange}
                disabled={isUploading}
              />
            </label>
            {!isUploading && <p className="pl-1">or drag and drop</p>}
          </div>
          <p className="text-xs leading-5 text-slate-500 mt-2">PDF, PPTX up to 50MB</p>
        </div>
      </div>
    </div>
  );
}
