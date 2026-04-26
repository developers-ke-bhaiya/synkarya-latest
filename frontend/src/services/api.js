import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('synkarya_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('synkarya_token');
      localStorage.removeItem('synkarya_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

// ─── Rooms ────────────────────────────────────────────────────────────────────
export const roomsApi = {
  create: (data) => api.post('/rooms', data),
  list: () => api.get('/rooms'),
  getByCode: (code) => api.get(`/rooms/code/${code}`),
  getById: (roomId) => api.get(`/rooms/${roomId}`),
};

// ─── Attendance ───────────────────────────────────────────────────────────────
export const attendanceApi = {
  getMyAttendance: () => api.get('/attendance/me'),
  getRoomAttendance: (roomId) => api.get(`/attendance/room/${roomId}`),
};

// ─── Messages ─────────────────────────────────────────────────────────────────
export const messagesApi = {
  getRoomMessages: (roomId, limit = 50) =>
    api.get(`/messages/room/${roomId}`, { params: { limit } }),
};

export default api;
