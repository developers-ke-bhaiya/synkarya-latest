import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { CallPage } from './pages/CallPage';
import { MyAttendancePage } from './pages/MyAttendancePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ToastProvider } from './components/ui/Toast';
import { useAuthStore } from './store/authStore';

const ProtectedRoute = ({ children }) => {
  const { token } = useAuthStore();
  return token ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { token } = useAuthStore();
  return !token ? children : <Navigate to="/" replace />;
};

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/" element={<ProtectedRoute><CallPage /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute><MyAttendancePage /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
