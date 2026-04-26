import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff, Zap } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import clsx from 'clsx';

const AuthPage = () => {
  const { user, login, register, isLoading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
  const [localError, setLocalError] = useState('');

  if (user) return <Navigate to="/dashboard" replace />;

  const handleChange = (e) => {
    clearError();
    setLocalError('');
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (mode === 'login') {
      const res = await login(form.username, form.password);
      if (!res.success) setLocalError(res.error);
    } else {
      if (!form.displayName.trim()) { setLocalError('Display name is required'); return; }
      const res = await register(form.username, form.password, form.displayName);
      if (!res.success) setLocalError(res.error);
    }
  };

  const displayError = localError || error;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Background blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-400/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 flex items-center justify-center">
              <Zap size={22} className="text-navy-950" fill="currentColor" />
            </div>
            <span
              className="text-2xl font-bold text-white"
              style={{ fontFamily: 'Syne, sans-serif' }}
            >
              Synkarya
            </span>
          </div>
          <p className="text-slate-500 text-sm">Real-time video, audio & chat</p>
        </div>

        {/* Card */}
        <div className="card p-8">
          {/* Tab switcher */}
          <div className="flex bg-white/4 rounded-xl p-1 mb-6">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); clearError(); setLocalError(''); }}
                className={clsx(
                  'flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200',
                  mode === m
                    ? 'bg-amber-400 text-navy-950'
                    : 'text-slate-400 hover:text-white'
                )}
                style={{ fontFamily: 'Syne, sans-serif' }}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label">Display Name</label>
                <input
                  name="displayName"
                  value={form.displayName}
                  onChange={handleChange}
                  type="text"
                  placeholder="John Doe"
                  className="input-field"
                  maxLength={40}
                  autoFocus
                />
              </div>
            )}

            <div>
              <label className="label">Username</label>
              <input
                name="username"
                value={form.username}
                onChange={handleChange}
                type="text"
                placeholder="johndoe"
                className="input-field"
                autoFocus={mode === 'login'}
                autoComplete="username"
                maxLength={30}
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  type={showPass ? 'text' : 'password'}
                  placeholder={mode === 'register' ? 'Min. 6 characters' : '••••••••'}
                  className="input-field pr-11"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {displayError && (
              <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg animate-fade-in">
                {displayError}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full justify-center py-3 text-base disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-navy-950/30 border-t-navy-950 rounded-full animate-spin" />
              ) : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {mode === 'register' && (
            <p className="text-xs text-slate-600 text-center mt-4">
              By creating an account, you agree to the terms of service.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
