import { create } from 'zustand';
import { authApi } from '../services/api';

const getStoredUser = () => {
  try {
    const raw = localStorage.getItem('synkarya_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const useAuthStore = create((set) => ({
  user: getStoredUser(),
  token: localStorage.getItem('synkarya_token') || null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authApi.login({ email, password });
      localStorage.setItem('synkarya_token', data.token);
      localStorage.setItem('synkarya_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isLoading: false });
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.error || 'Login failed';
      set({ error, isLoading: false });
      return { success: false, error };
    }
  },

  register: async (email, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authApi.register({ email, password, displayName });
      localStorage.setItem('synkarya_token', data.token);
      localStorage.setItem('synkarya_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isLoading: false });
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.error || 'Registration failed';
      set({ error, isLoading: false });
      return { success: false, error };
    }
  },

  logout: () => {
    localStorage.removeItem('synkarya_token');
    localStorage.removeItem('synkarya_user');
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
