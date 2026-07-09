import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, apiClient } from '../api/client';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check auth state on initial load
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const userData = await api.getMe();
          setUser(userData);
        } catch (err) {
          console.error("Token invalid or expired", err);
          localStorage.removeItem('access_token');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const data = await api.login(email, password);
      localStorage.setItem('access_token', data.access_token);
      const userData = await api.getMe();
      setUser(userData);
      toast.success('Successfully logged in!');
      return userData;
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed');
      throw err;
    }
  };

  const register = async (name, email, password, role = 'faculty', adminSecret = '') => {
    try {
      await api.register({ name, email, password, role, admin_secret: adminSecret });
      toast.success('Registration successful! Please log in.');
      return true;
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed');
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setUser(null);
    toast.success('Logged out successfully');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
