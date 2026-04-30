import React, { useState } from 'react';
import { Phone, Users, Circle } from 'lucide-react';
import { useOnlineStore } from '../../store/onlineStore';
import { useAuthStore } from '../../store/authStore';
import { useDirectCall } from '../../hooks/useDirectCall';
import { Avatar } from '../ui/Avatar';

export const OnlineUsersList = ({ onClose }) => {
  const { onlineUsers, directCallStatus } = useOnlineStore();
  const { user } = useAuthStore();
  const { requestCall } = useDirectCall();
  const [callingUid, setCallingUid] = useState(null);

  const others = onlineUsers.filter((u) => u.uid !== user?.uid);

  const handleCall = (u) => {
    if (directCallStatus || callingUid) return;
    setCallingUid(u.uid);
    requestCall(u.uid, u.displayName, u.avatar);
    setTimeout(() => setCallingUid(null), 5000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Users size={13} className="text-slate-500" />
          <span className="font-bold text-white text-xs uppercase tracking-widest" style={{ fontFamily: 'Syne, sans-serif' }}>
            Online
          </span>
          {others.length > 0 && (
            <span className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5">
              <Circle size={5} className="text-emerald-400 fill-emerald-400" />
              <span className="text-xs text-emerald-400 font-bold">{others.length}</span>
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs text-slate-600 hover:text-slate-300 transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
          >
            Close
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {others.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
              <Users size={17} className="text-slate-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">No one else online</p>
              <p className="text-xs text-slate-700 mt-0.5">Invite teammates to collaborate</p>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {others.map((u) => (
              <div
                key={u.uid}
                className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl transition-all group cursor-default hover:bg-white/4"
              >
                {/* Avatar + online dot */}
                <div className="relative flex-shrink-0">
                  <Avatar name={u.displayName} size="sm" />
                  <div className="online-dot" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate leading-tight">
                    {u.displayName}
                  </p>
                  {u.status ? (
                    <p className="text-xs truncate mt-0.5 flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                      <span className="opacity-70">🎯</span>
                      <span className="truncate opacity-80">{u.status}</span>
                    </p>
                  ) : (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Available</p>
                  )}
                </div>

                {/* Call button — visible on hover */}
                <button
                  onClick={() => handleCall(u)}
                  disabled={!!directCallStatus || !!callingUid}
                  title={`Call ${u.displayName}`}
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 opacity-0 group-hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed"
                  style={{
                    background: 'var(--success-dim)',
                    color: 'var(--success)',
                    border: '1px solid rgba(16,185,129,0.2)',
                  }}
                  onMouseEnter={e => {
                    if (!directCallStatus && !callingUid) {
                      e.currentTarget.style.background = 'var(--success)';
                      e.currentTarget.style.color = '#fff';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(16,185,129,0.3)';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--success-dim)';
                    e.currentTarget.style.color = 'var(--success)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {callingUid === u.uid ? (
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Phone size={13} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Self status at bottom */}
      <div
        className="px-3 py-2.5 flex-shrink-0 flex items-center gap-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="relative flex-shrink-0">
          <Avatar name={user?.displayName || '?'} size="xs" />
          <div className="online-dot" style={{ width: 8, height: 8 }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
            {user?.displayName}
          </p>
        </div>
        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--success-dim)', color: 'var(--success)', fontSize: '10px' }}>
          You
        </span>
      </div>
    </div>
  );
};
