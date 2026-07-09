import React, { useState } from 'react';
import UploadStep from './UploadStep';
import VectorizeStep from './VectorizeStep';
import ConfigureStep from './ConfigureStep';
import GenerateStep from './GenerateStep';
import DownloadCard from '../shared/DownloadCard';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import toast from 'react-hot-toast';

const STEPS = [
  { id: 1, name: 'Upload', description: 'Source File' },
  { id: 2, name: 'Vectorize', description: 'Process & Embed' },
  { id: 3, name: 'Configure', description: 'Set Parameters' },
  { id: 4, name: 'Generate', description: 'AI Agent' }
];

export default function WizardFlow() {
  const [currentStep, setCurrentStep] = useState(1);
  const [documentId, setDocumentId] = useState(null);
  const [quizJobId, setQuizJobId] = useState(null);
  const [isDone, setIsDone] = useState(false);

  // Handlers
  const handleUploadSuccess = (docId) => {
    setDocumentId(docId);
    setCurrentStep(2);
  };

  const handleVectorizeComplete = () => {
    setCurrentStep(3);
  };

  const handleConfigured = (jobId) => {
    setQuizJobId(jobId);
    setCurrentStep(4);
  };

  const handleGenerationComplete = (jobId) => {
    setIsDone(true);
  };

  const handleDownload = async () => {
    try {
      const result = await api.getQuizDownloadUrl(quizJobId);
      window.open(result.download_url, '_blank');
      toast.success("Download started!");
    } catch (err) {
      toast.error("Failed to fetch download link.");
    }
  };

  const resetFlow = () => {
    setCurrentStep(1);
    setDocumentId(null);
    setQuizJobId(null);
    setIsDone(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] border border-slate-200 overflow-hidden">
      {/* Horizontal Stepper Header */}
      <div className="border-b border-slate-200 px-8 py-6 bg-slate-50/50">
        <nav aria-label="Progress">
          <ol role="list" className="flex items-center">
            {STEPS.map((step, stepIdx) => (
              <li key={step.name} className={cn("relative", stepIdx !== STEPS.length - 1 ? "pr-8 sm:pr-20" : "")}>
                {stepIdx !== STEPS.length - 1 && (
                  <div className="absolute top-1/2 left-0 -translate-y-1/2 -z-10 w-full ml-10">
                    <div className={cn(
                      "h-0.5 w-full transition-colors duration-300", 
                      currentStep > step.id ? "bg-indigo-600" : "bg-slate-200"
                    )} />
                  </div>
                )}
                
                <div className="relative flex items-center justify-center bg-white">
                  <span className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors duration-300 z-10 bg-white",
                    currentStep > step.id ? "border-indigo-600 bg-indigo-600 text-white" : 
                      currentStep === step.id ? "border-indigo-600 text-indigo-600" : "border-slate-300 text-slate-500"
                  )}>
                    {currentStep > step.id ? (
                      <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      step.id
                    )}
                  </span>
                  <span className="ml-3 hidden sm:block">
                    <span className={cn(
                      "block text-sm font-semibold tracking-wide uppercase",
                      currentStep >= step.id ? "text-indigo-600" : "text-slate-500"
                    )}>{step.name}</span>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* active content area */}
      <div className="p-8 min-h-[400px] flex flex-col justify-center items-center">
        {!isDone ? (
          <div className="w-full max-w-2xl">
            {currentStep === 1 && <UploadStep onUploadSuccess={handleUploadSuccess} />}
            {currentStep === 2 && documentId && <VectorizeStep documentId={documentId} onComplete={handleVectorizeComplete} />}
            {currentStep === 3 && documentId && <ConfigureStep documentId={documentId} onConfigured={handleConfigured} />}
            {currentStep === 4 && quizJobId && <GenerateStep jobId={quizJobId} onComplete={handleGenerationComplete} />}
          </div>
        ) : (
          <div className="w-full max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Success!</h2>
            <p className="text-slate-500 mb-8">Your quiz has been fully generated and packaged.</p>
            <DownloadCard quizId={quizJobId} onDownload={handleDownload} />
            <button 
              onClick={resetFlow}
              className="mt-8 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
            >
              Start New Flow &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
