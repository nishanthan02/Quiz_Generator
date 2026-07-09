import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token automatically to every request if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  // --- Authentication ---
  login: async (email, password) => {
    const formData = new URLSearchParams();
    formData.append('username', email); // FastAPI OAuth2 expects 'username'
    formData.append('password', password);
    const response = await apiClient.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  },
  register: async (userData) => {
    const response = await apiClient.post('/auth/register', userData);
    return response.data;
  },
  getMe: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  // --- Management (Faculty) ---
  getSubjects: async () => {
    const response = await apiClient.get('/management/subjects');
    return response.data;
  },
  getSubject: async (subjectId) => {
    const response = await apiClient.get(`/management/subjects/${subjectId}`);
    return response.data;
  },
  createSubject: async (data) => {
    const response = await apiClient.post('/management/subjects', data);
    return response.data;
  },
  uploadDocument: async (subjectId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`/management/subjects/${subjectId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  deleteDocument: async (subjectId, documentId) => {
    const response = await apiClient.delete(`/management/subjects/${subjectId}/documents/${documentId}`);
    return response.data;
  },
  getQuiz: async (quizId) => {
    const response = await apiClient.get(`/management/quizzes/${quizId}`);
    return response.data;
  },
  updateQuiz: async (quizId, data) => {
    const response = await apiClient.put(`/management/quizzes/${quizId}/bulk`, data);
    return response.data;
  },
  deleteQuiz: async (quizId) => {
    const response = await apiClient.delete(`/management/quizzes/${quizId}`);
    return response.data;
  },

  // --- Learning (Students) ---
  getAvailableSubjects: async () => {
    const response = await apiClient.get('/learning/subjects/available');
    return response.data;
  },
  enrollSubject: async (subjectId) => {
    const response = await apiClient.post(`/learning/enroll/${subjectId}`);
    return response.data;
  },
  getQuizzesForSubject: async (subjectId) => {
    const response = await apiClient.get(`/learning/subjects/${subjectId}/quizzes`);
    return response.data;
  },
  
  // --- Legacy Agentic Triggers (If still used) ---
  generateQuiz: async (data) => {
    const response = await apiClient.post('/quiz/generate', data);
    return response.data;
  },
  generateSubjectQuiz: async (subjectId, data) => {
    const response = await apiClient.post(`/management/subjects/${subjectId}/generate-quiz`, data);
    return response.data;
  }
};
