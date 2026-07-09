import React from 'react';
import StatusBadge from './StatusBadge';
import { FileText, Download, Calendar } from 'lucide-react';

export default function DocumentList({ documents }) {
  if (!documents || documents.length === 0) {
    return (
      <div className="text-center p-12 bg-white rounded-xl border border-slate-200 border-dashed">
        <FileText className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-2 text-sm font-medium text-slate-900">No documents</h3>
        <p className="mt-1 text-sm text-slate-500">Upload a PDF or PPTX to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-xl overflow-hidden">
      <ul role="list" className="divide-y divide-slate-100">
        {documents.map((doc) => (
          <li key={doc.document_id || doc.id} className="p-4 hover:bg-slate-50 transition-colors duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center min-w-0 gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center border border-indigo-100">
                  <FileText className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {doc.filename}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                    <span>&middot;</span>
                    <span>ID: {doc.document_id || doc.id}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <StatusBadge status={doc.status} errorMsg={doc.error_msg} />
                
                {doc.status === 'complete' && (
                  <button className="text-slate-400 hover:text-indigo-600 transition-colors" title="Generate Quiz">
                    <Download className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
