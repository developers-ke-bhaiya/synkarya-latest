import React, { useState } from 'react';
import { Phone, X, Users } from 'lucide-react';
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
    if (directCallStatus) return;
    setCallingUid(u.uid);
    requestCall(u.uid, u.displayName, u.avatar);
    setTimeout(() => setCallingUid(null), 3000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Users size={15} className="text-amber-400" />
          <h3 className="font-semibold text-white text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>
            Online Today
          </h3>
          <span className="badge bg-emerald-400/15 text-emerald-400 border border-emerald-400/20">
            {others.length}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center
              text-slate-400 hover:text-white transition-all">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {others.length === 0 ? (
          <div className="text-center py-10 text-slate-600 text-sm px-4">
            No other users online today
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {others.map((u) => (
              <div key={u.uid}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all group">
                {/* Avatar with online dot */}
                <div className="relative flex-shrink-0">
                  <Avatar name={u.displayName} size="sm" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full
                    bg-emerald-400 border-2 border-[var(--bg-secondary)]" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.displayName}</p>
                  {u.currentStatus ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mt-0.5
                      bg-amber-400/10 text-amber-400 border border-amber-400/20 max-w-full truncate">
                      🎯 {u.currentStatus}
                    </span>
                  ) : (
                    <p className="text-xs text-slate-600">No status set</p>
                  )}
                </div>

                {/* Call button */}
                <button
                  onClick={() => handleCall(u)}
                  disabled={!!directCallStatus || callingUid === u.uid}
                  title={`Call ${u.displayName}`}
                  className="w-8 h-8 rounded-xl bg-emerald-500/10 hover:bg-emerald-500
                    text-emerald-400 hover:text-white flex items-center justify-center
                    transition-all duration-200 opacity-0 group-hover:opacity-100
                    disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">
                  <Phone size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
