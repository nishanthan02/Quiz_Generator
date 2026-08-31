import axios from 'axios';

/**
 * Safely extract a human-readable message from a FastAPI error response.
 * FastAPI returns a string for most errors, but Pydantic validation errors (422)
 * return an array of { type, loc, msg, input } objects. Rendering that array
 * directly as a React child throws "Objects are not valid as a React child".
 */
export function getApiErrorMessage(err, fallback = 'An unexpected error occurred') {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    // Pydantic v2 validation error array — join the human-readable messages
    return detail.map(e => e?.msg || JSON.stringify(e)).join('; ');
  }
  return fallback;
}

// Temporarily hardcoded to 7860 (the Docker port) to avoid .env configuration issues
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:7860';

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
  updateSubject: async (subjectId, data) => {
    const response = await apiClient.put(`/management/subjects/${subjectId}`, data);
    return response.data;
  },
  deleteSubject: async (subjectId) => {
    const response = await apiClient.delete(`/management/subjects/${subjectId}`);
    return response.data;
  },
  uploadDocument: async (subjectId, file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Append any additional options like start_page, end_page, doc_type, language
    Object.keys(options).forEach(key => {
      if (options[key] !== undefined && options[key] !== null) {
        formData.append(key, options[key]);
      }
    });

    // IMPORTANT: Delete the default 'Content-Type: application/json' header for this
    // request so the browser can set 'multipart/form-data' with the correct boundary.
    // If we leave the JSON header, FastAPI cannot parse the file upload and returns 422.
    const response = await apiClient.post(
      `/management/subjects/${subjectId}/documents`,
      formData,
      { headers: { 'Content-Type': undefined } },
    );
    return response.data;
  },
  deleteDocument: async (subjectId, documentId) => {
    const response = await apiClient.delete(`/management/subjects/${subjectId}/documents/${documentId}`);
    return response.data;
  },
  downloadDocumentRaw: async (documentId) => {
    const response = await apiClient.get(`/management/documents/${documentId}/download/raw`, {
      responseType: 'blob',
    });
    return response;
  },
  downloadDocumentChunks: async (documentId) => {
    const response = await apiClient.get(`/management/documents/${documentId}/download/chunks`, {
      responseType: 'blob',
    });
    return response;
  },
  getQuiz: async (quizId) => {
    const response = await apiClient.get(`/management/quizzes/${quizId}`);
    return response.data;
  },
  updateQuizBulk: async (quizId, data) => {
    const response = await apiClient.put(`/management/quizzes/${quizId}/bulk`, data);
    return response.data;
  },
  updateQuiz: async (quizId, data) => {
    const response = await apiClient.put(`/management/quizzes/${quizId}`, data);
    return response.data;
  },
  deleteQuiz: async (quizId) => {
    const response = await apiClient.delete(`/management/quizzes/${quizId}`);
    return response.data;
  },
  enrollStudent: async (subjectId, data) => {
    const response = await apiClient.post(`/management/subjects/${subjectId}/enroll`, data);
    return response.data;
  },
  getEnrolledStudents: async (subjectId) => {
    const response = await apiClient.get(`/management/subjects/${subjectId}/students`);
    return response.data;
  },
  getQuizResults: async (quizId) => {
    const response = await apiClient.get(`/management/quizzes/${quizId}/results`);
    return response.data;
  },

  // --- Student ---
  getStudentSubjects: async () => {
    const response = await apiClient.get('/student/subjects');
    return response.data;
  },
  getStudentSubjectQuizzes: async (subjectId) => {
    const response = await apiClient.get(`/student/subjects/${subjectId}/quizzes`);
    return response.data;
  },
  getStudentQuiz: async (quizId) => {
    const response = await apiClient.get(`/student/quizzes/${quizId}`);
    return response.data;
  },
  submitQuiz: async (quizId, answers) => {
    const response = await apiClient.post(`/student/quizzes/${quizId}/submit`, answers);
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
