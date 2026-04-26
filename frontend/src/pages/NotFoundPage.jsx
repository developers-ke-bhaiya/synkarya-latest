import { useNavigate } from 'react-router-dom';
import { Home, Zap } from 'lucide-react';

const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center text-center p-8"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="w-16 h-16 rounded-3xl bg-amber-400/10 flex items-center justify-center mb-6">
        <Zap size={32} className="text-amber-400" />
      </div>
      <h1 className="text-5xl font-bold text-white mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>
        404
      </h1>
      <p className="text-slate-500 mb-8">This page doesn't exist.</p>
      <button onClick={() => navigate('/dashboard')} className="btn-primary">
        <Home size={16} /> Go to Dashboard
      </button>
    </div>
  );
};

export default NotFoundPage;
