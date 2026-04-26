import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Zap, UserPlus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../ui/Toast';
import { Spinner } from '../ui/Spinner';

export const RegisterPage = () => {
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const { register, isLoading } = useAuthStore();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      addToast('Passwords do not match', 'error');
      return;
    }
    const result = await register(form.username.trim(), form.password, form.displayName.trim());
    if (result.success) {
      addToast('Account created! Welcome to Synkarya.', 'success');
      navigate('/');
    } else {
      addToast(result.error, 'error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-400/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
            bg-gradient-to-br from-amber-400 to-amber-600 mb-4 shadow-lg shadow-amber-400/20">
            <Zap size={28} className="text-navy-950" fill="currentColor" />
          </div>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Synkarya</h1>
          <p className="text-slate-500 mt-1 text-sm">Create your account</p>
        </div>

        <div className="card p-8">
          <h2 className="text-xl font-bold text-white mb-6" style={{ fontFamily: 'Syne, sans-serif' }}>
            Get started
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Display Name</label>
              <input className="input-field" type="text" placeholder="Jane Doe"
                value={form.displayName} onChange={set('displayName')} required />
            </div>
            <div>
              <label className="label">Username</label>
              <input className="input-field" type="text" placeholder="jane_doe"
                value={form.username} onChange={set('username')} autoComplete="username" required />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input className="input-field pr-11" type={showPw ? 'text' : 'password'}
                  placeholder="Min. 6 characters" value={form.password} onChange={set('password')}
                  autoComplete="new-password" required />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input className="input-field" type={showPw ? 'text' : 'password'}
                placeholder="Repeat password" value={form.confirm} onChange={set('confirm')}
                autoComplete="new-password" required />
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center mt-2">
              {isLoading ? <Spinner size="sm" /> : <UserPlus size={16} />}
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-amber-400 hover:text-amber-300 transition-colors font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
