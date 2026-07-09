import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

export default function PublicNavbar() {
  const { user } = useAuth();
  const location = useLocation();

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Model Comparison', path: '/analytics' },
  ];

  return (
    <div className="w-full bg-white/80 backdrop-blur-md border-b border-indigo-100 flex items-center justify-between px-6 py-4 z-50 sticky top-0 shadow-sm">
      <div className="flex items-center space-x-8 max-w-7xl w-full mx-auto justify-between">
        <Link to="/" className="flex items-center group">
          <ShieldAlert className="w-7 h-7 text-indigo-600 mr-2 group-hover:text-indigo-500 transition-colors" />
          <span className="font-bold text-2xl tracking-tight text-slate-900 group-hover:text-indigo-900 transition-colors">Aegis</span>
        </Link>
        
        <nav className="hidden md:flex items-center space-x-8">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  "text-sm font-semibold transition-colors",
                  isActive 
                    ? "text-indigo-600" 
                    : "text-slate-500 hover:text-indigo-500"
                )}
              >
                {item.name}
              </Link>
            );
          })}
          
          <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
          
          {user ? (
            <Link 
              to="/dashboard-redirect"
              className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-full transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link 
              to="/login"
              className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-full transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
