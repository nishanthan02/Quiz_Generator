import React from 'react';
import PublicNavbar from './PublicNavbar';
import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="flex flex-col min-h-screen w-full bg-slate-50 text-slate-900 font-sans selection:bg-indigo-200">
      <PublicNavbar />
      <main className="flex-1 w-full relative overflow-x-hidden">
        {/* Universal bright refreshing background effect for public pages */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100 via-white to-slate-50 pointer-events-none" />
        <div className="relative z-10 w-full h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
