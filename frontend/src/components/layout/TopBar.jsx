import React from 'react';
import { Hash, Users, Copy, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { useCallStore } from '../../store/callStore';
import { useToast } from '../ui/Toast';

export const TopBar = () => {
  const { currentRoom, peerInfo } = useCallStore();
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

  if (!currentRoom) {
    return (
      <div className="h-14 flex items-center px-6"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <p className="text-sm text-slate-600">Join a room to start calling</p>
      </div>
    );
  }

  return (
    <div className="h-14 flex items-center justify-between px-6"
      style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>

      {/* Room name */}
      <div className="flex items-center gap-2.5">
        <Hash size={16} className="text-amber-400" />
        <span className="font-semibold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
          {currentRoom.name}
        </span>
        <span className="badge bg-white/5 text-slate-400 border border-white/5">
          {currentRoom.type === 'private' ? '🔒 Private' : '🌐 Open'}
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Participant count */}
        <div className="flex items-center gap-1.5 text-sm text-slate-400">
          <Users size={14} />
          <span>{participantCount}</span>
        </div>

        {/* Room code */}
        {currentRoom.code && (
          <button
            onClick={copyCode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg
              bg-white/5 hover:bg-white/10 transition-all border border-white/5
              text-slate-400 hover:text-white group"
          >
            <span className="text-xs font-mono tracking-widest">{currentRoom.code}</span>
            {copied
              ? <CheckCircle size={12} className="text-emerald-400" />
              : <Copy size={12} className="group-hover:text-amber-400 transition-colors" />
            }
          </button>
        )}
      </div>
    </div>
  );
};
