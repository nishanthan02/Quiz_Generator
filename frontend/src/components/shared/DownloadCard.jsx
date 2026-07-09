import React from 'react';
import { Download, FileJson, ExternalLink } from 'lucide-react';

export default function DownloadCard({ quizId, onDownload }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100">
              <FileJson className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Quiz Generation Complete</h3>
              <p className="text-sm text-slate-500 mt-1">
                Your AI-generated quiz variants are ready for download.
              </p>
            </div>
          </div>
          <button
            onClick={onDownload}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm ring-1 ring-inset ring-indigo-700/10 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"
          >
            <Download className="h-4 w-4" />
            Download Quiz JSON
          </button>
        </div>
      </div>
      <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>Job ID: {quizId}</span>
        <a href="#" className="inline-flex items-center gap-1 hover:text-indigo-600 transition-colors">
          View Raw Payload <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
