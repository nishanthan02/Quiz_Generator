import React, { useEffect } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { api } from '../../api/client';
import { Bot, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

export default function GenerateStep({ jobId, onComplete }) {
  const { data, error, startPolling, stopPolling } = usePolling(api.getQuizStatus, jobId, 3000);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  useEffect(() => {
    if (data?.status === 'complete') {
      setTimeout(() => onComplete(jobId), 1500);
    }
  }, [data, jobId, onComplete]);

  if (error || data?.status === 'failed') {
    return (
      <div className="w-full text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-rose-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-900">Generation Failed</h3>
        <p className="text-sm text-slate-500 mt-2">{error?.message || data?.error_msg}</p>
      </div>
    );
  }

  const status = data?.status || 'queued';
  const isQueued = status === 'queued';
  const isGenerating = status === 'generating';
  const isComplete = status === 'complete';

  return (
    <div className="w-full text-center py-12">
      <h2 className="text-lg font-semibold text-slate-900 mb-8">Step 4: Agentic Generation</h2>
      
      <div className="flex justify-center items-center min-h-[160px]">
        {isComplete ? (
          <div className="flex flex-col items-center">
            <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4 border border-emerald-200">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="text-slate-900 font-medium text-lg">Variants Created</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className={`relative flex items-center justify-center h-20 w-20 rounded-2xl mb-6 shadow-sm border ${isGenerating ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
              <Bot className={`h-10 w-10 ${isGenerating ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}`} />
              {isGenerating && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500"></span>
                </span>
              )}
            </div>
            
            <h3 className="text-lg font-medium text-slate-800 flex items-center gap-2">
              {isQueued && "In Queue"}
              {isGenerating && (
                <>
                  <Sparkles className="w-5 h-5 text-indigo-500 fill-indigo-100" />
                  AI is Thinking...
                </>
              )}
            </h3>
            
            <p className="text-sm text-slate-500 mt-2 max-w-sm">
              {isQueued && "Waiting for an available worker pool. If a large variant set was requested previously, this may take a moment."}
              {isGenerating && "Gemini is currently executing the agentic workflow to build out the high-quality question variants."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
