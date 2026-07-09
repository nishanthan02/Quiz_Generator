import React from 'react';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function StatusBadge({ status, errorMsg }) {
  const normalizedStatus = (status || 'pending').toLowerCase();
  
  const config = {
    pending: {
      color: 'bg-slate-100 text-slate-600 border-slate-200',
      icon: Clock,
      label: 'In Queue'
    },
    processing: {
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      icon: Loader2,
      label: 'Extracting',
      spin: true,
      pulse: true
    },
    complete: {
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2,
      label: 'Ready'
    },
    failed: {
      color: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: XCircle,
      label: 'Failed'
    }
  };

  const current = config[normalizedStatus] || config.pending;
  const Icon = current.icon;

  return (
    <div 
      title={errorMsg || ''}
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border cursor-default transition-colors",
        current.color,
        current.pulse && "animate-pulse"
      )}
    >
      <Icon className={cn("w-3.5 h-3.5 mr-1.5", current.spin && "animate-spin")} />
      {current.label}
    </div>
  );
}
