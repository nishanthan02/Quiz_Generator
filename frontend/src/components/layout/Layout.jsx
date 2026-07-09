import React from 'react';
import Navbar from './Navbar';
import { Outlet } from 'react-router-dom';

export default function Layout({ children }) {
  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden text-slate-900 font-sans">
      <Navbar />
      <main className="flex-1 overflow-y-auto w-full p-8 relative">
        <div className="max-w-6xl mx-auto">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
}
