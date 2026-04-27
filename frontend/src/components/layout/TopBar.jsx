import React, { useState } from 'react';
import { Hash, Users, Copy, CheckCircle } from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { useOnlineStore } from '../../store/onlineStore';
import { useToast } from '../ui/Toast';

export const TopBar = () => {
  const { currentRoom, peerInfo } = useCallStore();
  const { onlineUsers } = useOnlineStore();
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  const participantCount = 1 + peerInfo.size;

  const copyCode = () => {
    if (!currentRoom?.code) return;
    navigator.clipboard.writeText(currentRoom.code);
    setCopied(true);
    addToast(`Room code ${currentRoom.code} copied!`, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-14 flex items-center justify-between px-3 sm:px-6 flex-1"
      style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>

      <div className="flex items-center gap-2 min-w-0">
        {currentRoom ? (
          <>
            <Hash size={14} className="text-amber-400 flex-shrink-0" />
            <span className="font-semibold text-white truncate text-sm sm:text-base"
              style={{ fontFamily: 'Syne, sans-serif' }}>
              {currentRoom.name}
            </span>
            <span className="hidden sm:inline badge bg-white/5 text-slate-400 border border-white/5 flex-shrink-0">
              {currentRoom.type === 'private' ? '🔒' : '🌐'} {currentRoom.type}
            </span>
          </>
        ) : (
          <span className="text-sm text-slate-600">Join a room to start</span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        {/* Online count */}
        <div className="flex items-center gap-1.5 text-sm text-slate-400">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="hidden sm:inline text-xs">{onlineUsers.length} online</span>
        </div>

        {/* Participants in call */}
        {currentRoom && (
          <div className="flex items-center gap-1.5 text-sm text-slate-400">
            <Users size={13} />
            <span className="text-xs">{participantCount}</span>
          </div>
        )}

        {/* Room code */}
        {currentRoom?.code && (
          <button onClick={copyCode}
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg
              bg-white/5 hover:bg-white/10 transition-all border border-white/5
              text-slate-400 hover:text-white group">
            <span className="text-xs font-mono tracking-widest">{currentRoom.code}</span>
            {copied
              ? <CheckCircle size={11} className="text-emerald-400" />
              : <Copy size={11} className="group-hover:text-amber-400 transition-colors" />
            }
          </button>
        )}
      </div>
    </div>
  );
};
