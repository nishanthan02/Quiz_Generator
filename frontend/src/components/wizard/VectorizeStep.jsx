import React, { useEffect, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { api } from '../../api/client';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VectorizeStep({ documentId, onComplete }) {
  const { data, error, startPolling, stopPolling, isPolling } = usePolling(api.getDocumentStatus, documentId, 2000);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);

  const loadingPhrases = [
    "Extracting text from document...",
    "Chunking content for vectorization...",
    "Embedding context using Gemini AI...",
    "Storing embeddings in Qdrant...",
    "Finalizing document processing..."
  ];

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  useEffect(() => {
    if (isPolling) {
      const interval = setInterval(() => {
        setLoadingTextIndex(prev => (prev + 1) % loadingPhrases.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isPolling, loadingPhrases.length]);

  useEffect(() => {
    if (data?.status === 'complete') {
      setTimeout(() => onComplete(data), 1000); // 1s grace period to show green check
    }
  }, [data, onComplete]);

  if (error || data?.status === 'failed') {
    return (
      <div className="w-full text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-rose-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-900">Processing Failed</h3>
        <p className="text-sm text-slate-500 mt-2">{error?.message || data?.error_msg}</p>
      </div>
    );
  }

  const isComplete = data?.status === 'complete';

  return (
    <div className="w-full text-center py-12">
      <h2 className="text-lg font-semibold text-slate-900 mb-8">Step 2: Vectorizing Document</h2>
      
      <div className="flex flex-col items-center justify-center min-h-[160px]">
        {isComplete ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center"
          >
            <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="text-slate-900 font-medium text-lg">Vectorization Complete!</p>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center">
            <Loader2 className="h-10 w-10 text-indigo-600 animate-spin mb-6" />
            
            <div className="h-8 relative w-full overflow-hidden flex justify-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={loadingTextIndex}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-slate-600 font-medium absolute"
                >
                  {loadingPhrases[loadingTextIndex]}
                </motion.p>
              </AnimatePresence>
            </div>
            
            <p className="text-xs text-slate-400 mt-4 uppercase tracking-wider font-semibold">
              Status: {data?.status || 'pending'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
