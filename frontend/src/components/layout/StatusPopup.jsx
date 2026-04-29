import React, { useState, useEffect } from 'react';
import { Zap, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { usersApi } from '../../services/api';
import { getSocket } from '../../services/socket';

const STATUS_KEY = 'synkarya_status_last_asked';
const ONE_HOUR = 60 * 60 * 1000;

const SUGGESTIONS = [
  'Working on a project', 'In a meeting', 'Coding', 'Designing',
  'Reviewing documents', 'Brainstorming', 'Learning something new', 'Writing',
];

export const StatusPopup = () => {
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;
    const check = () => {
      const last = localStorage.getItem(STATUS_KEY);
      if (!last || Date.now() - parseInt(last) > ONE_HOUR) {
        setTimeout(() => setShow(true), 2500);
      }
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!status.trim()) return;
    setSubmitting(true);
    try {
      // Save to Firestore via REST
      await usersApi.updateStatus(status.trim());
      // Also broadcast via socket immediately
      const socket = getSocket();
      socket.emit('update_status', { status: status.trim() });
      localStorage.setItem(STATUS_KEY, Date.now().toString());
      setSubmitted(true);
      setTimeout(() => { setShow(false); setSubmitted(false); setStatus(''); }, 1500);
    } catch (err) {
      console.error('Status update error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(STATUS_KEY, Date.now().toString());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md animate-slide-up">
        <div className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="h-1 bg-gradient-to-r from-amber-400 to-violet-500" />
          <div className="p-6">
            {submitted ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">🎯</div>
                <p className="text-white font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Status updated!</p>
                <p className="text-slate-500 text-sm mt-1">Visible to your team</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-400/15 flex items-center justify-center">
                      <Zap size={18} className="text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
                        Hey {user?.displayName?.split(' ')[0]}! 👋
                      </h3>
                      <p className="text-slate-500 text-sm">Kya kaam kar rahe ho abhi?</p>
                    </div>
                  </div>
                  <button onClick={dismiss}
                    className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center
                      text-slate-500 hover:text-white transition-all flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <input
                    className="input-field"
                    placeholder="e.g. Working on login feature..."
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    autoFocus
                    maxLength={80}
                  />
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => setStatus(s)}
                        className="text-xs px-2.5 py-1 rounded-full bg-white/5 hover:bg-amber-400/15
                          text-slate-400 hover:text-amber-400 border border-white/5 hover:border-amber-400/30
                          transition-all duration-200">
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={dismiss}
                      className="flex-1 py-2.5 rounded-xl text-sm bg-white/5 text-slate-400 hover:text-white transition-all">
                      Skip
                    </button>
                    <button type="submit" disabled={!status.trim() || submitting}
                      className="flex-1 py-2.5 rounded-xl text-sm bg-amber-400 hover:bg-amber-500
                        text-navy-950 font-semibold transition-all disabled:opacity-40">
                      {submitting ? 'Saving...' : 'Set status'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
