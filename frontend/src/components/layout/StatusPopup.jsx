import React, { useState, useEffect, useRef } from 'react';
import { Zap, X, Pencil, Check } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { usersApi } from '../../services/api';
import { getSocket } from '../../services/socket';
import { useOnlineStore } from '../../store/onlineStore';

const STATUS_KEY = 'synkarya_status_last_asked';
const ONE_HOUR = 60 * 60 * 1000;

const SUGGESTIONS = [
  'Working on a project 💻', 'In a meeting 📞', 'Coding 🧑‍💻', 'Designing 🎨',
  'Reviewing docs 📄', 'Brainstorming 💡', 'Learning 📚', 'Writing ✍️',
  'On a break ☕', 'Available 🟢',
];

// ── Inline status editor — shown in the sidebar user section ─────────────────
export const StatusEditor = () => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  const { user } = useAuthStore();
  const { onlineUsers } = useOnlineStore();
  const inputRef = useRef(null);

  const currentUser = onlineUsers.find(u => u.uid === user?.uid);
  const currentStatus = currentUser?.status || '';

  useEffect(() => {
    if (editing) {
      setVal(currentStatus);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [editing]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const text = val.trim();
      await usersApi.updateStatus(text);
      const socket = getSocket();
      socket.emit('update_status', { status: text });
      localStorage.setItem(STATUS_KEY, Date.now().toString());
      setEditing(false);
    } catch (err) {
      console.error('Status save error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="px-3 py-2 space-y-2 animate-slide-up" style={{ borderTop: '1px solid var(--border)' }}>
        <input
          ref={inputRef}
          className="input-field text-sm py-2"
          placeholder="What are you working on?"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          maxLength={80}
        />
        <div className="flex flex-wrap gap-1.5 pb-1">
          {SUGGESTIONS.slice(0, 6).map(s => (
            <button key={s} onClick={() => setVal(s)}
              className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 hover:bg-amber-400/15 text-slate-500 hover:text-amber-400 border border-white/5 hover:border-amber-400/20 transition-all">
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)}
            className="flex-1 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all"
            style={{ background: 'var(--accent)', color: '#0b0e14', fontFamily: 'Syne, sans-serif' }}>
            {saving ? '...' : <><Check size={11} /> Save</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
      <button
        onClick={() => setEditing(true)}
        className="w-full flex items-center gap-2 group cursor-pointer rounded-xl px-2 py-2 transition-all hover:bg-white/4"
        title="Edit your status"
      >
        <div className="flex-1 min-w-0 text-left">
          {currentStatus ? (
            <p className="text-xs truncate" style={{ color: 'var(--accent)' }}>🎯 {currentStatus}</p>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>+ Set a status</p>
          )}
        </div>
        <Pencil size={11} className="text-slate-700 group-hover:text-amber-400 transition-colors flex-shrink-0" />
      </button>
    </div>
  );
};

// ── Auto-prompt popup (shows once per hour if no status) ─────────────────────
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
        setTimeout(() => setShow(true), 3000);
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
      await usersApi.updateStatus(status.trim());
      const socket = getSocket();
      socket.emit('update_status', { status: status.trim() });
      localStorage.setItem(STATUS_KEY, Date.now().toString());
      setSubmitted(true);
      setTimeout(() => { setShow(false); setSubmitted(false); setStatus(''); }, 1500);
    } catch (err) { console.error('Status update error:', err); }
    finally { setSubmitting(false); }
  };

  const dismiss = () => {
    localStorage.setItem(STATUS_KEY, Date.now().toString());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md animate-scale-in">
        <div className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="h-1 bg-gradient-to-r from-amber-400 to-violet-500" />
          <div className="p-6">
            {submitted ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">🎯</div>
                <p className="text-white font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>Status set!</p>
                <p className="text-slate-500 text-sm mt-1">Your team can see what you're up to</p>
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
                      <p className="text-slate-500 text-sm">Kya kaam kar rahe ho?</p>
                    </div>
                  </div>
                  <button onClick={dismiss}
                    className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-white transition-all">
                    <X size={14} />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <input className="input-field" placeholder="e.g. Working on login feature..."
                    value={status} onChange={e => setStatus(e.target.value)} autoFocus maxLength={80} />
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map(s => (
                      <button key={s} type="button" onClick={() => setStatus(s)}
                        className="text-xs px-2.5 py-1 rounded-full bg-white/5 hover:bg-amber-400/15 text-slate-400 hover:text-amber-400 border border-white/5 hover:border-amber-400/20 transition-all">
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
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                      style={{ background: 'var(--accent)', color: '#0b0e14', fontFamily: 'Syne, sans-serif' }}>
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
