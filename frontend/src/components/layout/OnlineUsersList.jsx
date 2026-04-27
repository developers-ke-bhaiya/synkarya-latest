import React, { useState } from 'react';
import { Phone, Users } from 'lucide-react';
import { useOnlineStore } from '../../store/onlineStore';
import { useAuthStore } from '../../store/authStore';
import { useDirectCall } from '../../hooks/useDirectCall';
import { Avatar } from '../ui/Avatar';

export const OnlineUsersList = ({ onClose }) => {
  const { onlineUsers, directCallStatus } = useOnlineStore();
  const { user } = useAuthStore();
  const { requestCall } = useDirectCall();
  const [callingUid, setCallingUid] = useState(null);

  // Filter out self
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
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Users size={14} className="text-amber-400" />
          <span className="font-semibold text-white text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>
            Online Today
          </span>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-semibold">{others.length}</span>
          </span>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="text-xs text-slate-500 hover:text-white transition-colors px-2 py-1
              rounded-lg hover:bg-white/5">
            Close
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {others.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
              <Users size={18} className="text-slate-600" />
            </div>
            <p className="text-sm text-slate-600">No other users online today</p>
            <p className="text-xs text-slate-700 mt-1">Share the link to invite teammates</p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {others.map((u) => (
              <div key={u.uid}
                className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl
                  hover:bg-white/5 transition-all group cursor-default">

                {/* Avatar + online dot */}
                <div className="relative flex-shrink-0">
                  <Avatar name={u.displayName} size="sm" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full
                    bg-emerald-400 border-2 border-[var(--bg-secondary)]" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate leading-tight">
                    {u.displayName}
                  </p>
                  {u.status ? (
                    <p className="text-xs text-amber-400/80 truncate mt-0.5 flex items-center gap-1">
                      <span>🎯</span>
                      <span className="truncate">{u.status}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600 mt-0.5">No status</p>
                  )}
                </div>

                {/* Call button — visible on hover */}
                <button
                  onClick={() => handleCall(u)}
                  disabled={!!directCallStatus || !!callingUid}
                  title={`Call ${u.displayName}`}
                  className="w-8 h-8 rounded-xl bg-emerald-500/10 hover:bg-emerald-500
                    text-emerald-400 hover:text-white flex items-center justify-center
                    transition-all duration-200 flex-shrink-0
                    opacity-0 group-hover:opacity-100
                    disabled:opacity-20 disabled:cursor-not-allowed
                    hover:shadow-lg hover:shadow-emerald-500/20">
                  {callingUid === u.uid
                    ? <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    : <Phone size={13} />
                  }
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
