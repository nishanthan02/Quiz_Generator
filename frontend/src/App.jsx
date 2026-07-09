import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/layout/Layout';
import PublicLayout from './components/layout/PublicLayout';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Public Pages
import Home from './pages/public/Home';
import Analytics from './pages/public/Analytics';

// Auth Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

// Faculty Pages
import FacultyDashboard from './pages/faculty/Dashboard';
import SubjectDetail from './pages/faculty/SubjectDetail';
import QuizEditor from './pages/faculty/QuizEditor';

// Student Pages
import StudentDashboard from './pages/student/Dashboard';
import QuizTaker from './pages/student/QuizTaker';

// Sub-router guard for authenticated users
const ProtectedRoute = ({ allowedRoles }) => {
  const { user, loading } = useAuth();
  
  if (loading) return null; // or a spinner
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard-redirect" replace />; // or to unauthorized
  }

  return <Outlet />;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          {/* Dark Theme Public Routes */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/analytics" element={<Analytics />} />
          </Route>

          {/* Light Theme Configured Routes */}
          <Route element={<Layout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Base Redirect for Logged in Users trying to access /dashboard-redirect */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard-redirect" element={
                 <NavigateToDashboard />
              } />
            </Route>

            {/* Faculty Routes */}
            <Route element={<ProtectedRoute allowedRoles={['faculty', 'admin']} />}>
              <Route path="/faculty/dashboard" element={<FacultyDashboard />} />
              <Route path="/faculty/subject/:id" element={<SubjectDetail />} />
              <Route path="/faculty/quiz/:id/edit" element={<QuizEditor />} />
            </Route>
            
            {/* Student Routes */}
            <Route element={<ProtectedRoute allowedRoles={['student', 'admin']} />}>
              <Route path="/student/dashboard" element={<StudentDashboard />} />
              <Route path="/student/quiz/:id" element={<QuizTaker />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

const NavigateToDashboard = () => {
  const { user } = useAuth();
  if (user?.role === 'faculty') return <Navigate to="/faculty/dashboard" replace />;
  return <Navigate to="/student/dashboard" replace />;
};

export default App;
