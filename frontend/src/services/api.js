import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('synkarya_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('synkarya_token');
      localStorage.removeItem('synkarya_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

export const roomsApi = {
  create: (data) => api.post('/rooms', data),
  list: () => api.get('/rooms'),
  getByCode: (code) => api.get(`/rooms/code/${code}`),
  getById: (id) => api.get(`/rooms/${id}`),
};

export const attendanceApi = {
  getMyAttendance: () => api.get('/attendance/me'),
  getRoomAttendance: (roomId) => api.get(`/attendance/room/${roomId}`),
};

export const messagesApi = {
  getRoomMessages: (roomId, limit = 50) => api.get(`/messages/room/${roomId}`, { params: { limit } }),
};

export const usersApi = {
  getOnlineUsers: () => api.get('/users/online'),
  updateStatus: (status) => api.post('/users/status', { status }),
  getStatusHistory: (uid) => api.get(`/users/status-history/${uid}`),
};

export default api;
