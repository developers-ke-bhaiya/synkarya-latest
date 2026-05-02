import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Phone, Users, Circle, MessageSquare, X, Send, ArrowLeft, Bell } from 'lucide-react';
import { useOnlineStore } from '../../store/onlineStore';
import { useAuthStore } from '../../store/authStore';
import { useDirectCall } from '../../hooks/useDirectCall';
import { Avatar } from '../ui/Avatar';
import { formatMessageTime } from '../../utils/formatters';
import { getSocket } from '../../services/socket';

// ── Notification sound ────────────────────────────────────────────────────────
const playDMSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
  } catch {}
};

// ── Global DM store (module-level so it persists across panel opens/closes) ──
const dmStore = {
  conversations: new Map(), // peerUid → message[]
  unread: new Map(),        // peerUid → count
  listeners: new Set(),
  notify() { this.listeners.forEach(fn => fn()); },
  addMsg(peerUid, msg, isIncoming) {
    const conv = this.conversations.get(peerUid) || [];
    if (!conv.find(m => m.id === msg.id)) {
      this.conversations.set(peerUid, [...conv, msg]);
      if (isIncoming) {
        this.unread.set(peerUid, (this.unread.get(peerUid) || 0) + 1);
        playDMSound();
      }
      this.notify();
    }
  },
  markRead(peerUid) { this.unread.set(peerUid, 0); this.notify(); },
  getConv(peerUid) { return this.conversations.get(peerUid) || []; },
  getUnread(peerUid) { return this.unread.get(peerUid) || 0; },
  getTotalUnread() { let t = 0; this.unread.forEach(v => t += v); return t; },
};

// ── Register global DM socket listener ONCE ───────────────────────────────────
let dmListenerRegistered = false;
const registerDMListener = (myUid) => {
  if (dmListenerRegistered) return;
  dmListenerRegistered = true;
  const socket = getSocket();

  socket.on('dm_message', (msg) => {
    if (msg.uid === myUid) return; // shouldn't happen but guard
    dmStore.addMsg(msg.uid, msg, true);
  });

  socket.on('dm_message_sent', (msg) => {
    // Server confirmed delivery — already added optimistically, skip dup
    const conv = dmStore.getConv(msg.toUid);
    if (!conv.find(m => m.id === msg.id)) {
      dmStore.conversations.set(msg.toUid, [...conv, { ...msg, uid: myUid }]);
      dmStore.notify();
    }
  });
};

// ── DMChat panel ─────────────────────────────────────────────────────────────
const DMChat = ({ peer, myUid, onBack }) => {
  const [, forceUpdate] = useState(0);
  const [input, setInput] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    dmStore.markRead(peer.uid);
    const unsub = () => forceUpdate(n => n + 1);
    dmStore.listeners.add(unsub);
    return () => dmStore.listeners.delete(unsub);
  }, [peer.uid]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmStore.getConv(peer.uid).length]);

  const send = useCallback(() => {
    if (!input.trim()) return;
    const socket = getSocket();
    const msg = {
      id: Date.now().toString() + Math.random(),
      uid: myUid,
      message: input.trim(),
      timestamp: new Date().toISOString(),
    };
    // Optimistic add
    dmStore.addMsg(peer.uid, msg, false);
    socket.emit('dm_message', { targetUid: peer.uid, message: input.trim() });
    setInput('');
  }, [input, peer.uid, myUid]);

  const messages = dmStore.getConv(peer.uid);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-3 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={onBack}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
          style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)' }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
          <ArrowLeft size={14} />
        </button>
        <div className="relative flex-shrink-0">
          <Avatar name={peer.displayName} size="sm" />
          <div className="online-dot" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm truncate" style={{ fontFamily: 'Syne, sans-serif' }}>{peer.displayName}</p>
          <p className="text-xs" style={{ color: 'var(--success)' }}>Online · Direct message</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
        {messages.length === 0 && (
          <div className="text-center pt-8 px-4">
            <MessageSquare size={22} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{peer.displayName} ko message karo</p>
          </div>
        )}
        {messages.map(m => {
          const isMe = m.uid === myUid;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm break-words
                ${isMe ? 'bg-amber-400/20 text-amber-50 rounded-tr-sm' : 'bg-white/6 text-slate-200 rounded-tl-sm'}`}>
                <p>{m.message}</p>
                <p className={`text-[10px] mt-0.5 ${isMe ? 'text-amber-400/40' : 'text-slate-600'}`}>
                  {formatMessageTime(m.timestamp)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex gap-2">
          <input className="input-field flex-1 py-2 text-sm"
            placeholder={`Message ${peer.displayName}...`}
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            autoFocus />
          <button onClick={send} disabled={!input.trim()}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-30"
            style={{ background: 'var(--accent)' }}>
            <Send size={14} style={{ color: '#0b0e14' }} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ── OnlineUsersList ───────────────────────────────────────────────────────────
export const OnlineUsersList = ({ onClose }) => {
  const { onlineUsers, directCallStatus } = useOnlineStore();
  const { user } = useAuthStore();
  const { requestCall } = useDirectCall();
  const [callingUid, setCallingUid] = useState(null);
  const [dmPeer, setDmPeer] = useState(null);
  const [, forceUpdate] = useState(0);

  // Register global DM listener once per user session
  useEffect(() => {
    if (user?.uid) registerDMListener(user.uid);
    const unsub = () => forceUpdate(n => n + 1);
    dmStore.listeners.add(unsub);
    return () => dmStore.listeners.delete(unsub);
  }, [user?.uid]);

  const others = onlineUsers.filter(u => u.uid !== user?.uid);

  const handleCall = (u) => {
    if (directCallStatus || callingUid) return;
    setCallingUid(u.uid);
    requestCall(u.uid, u.displayName, u.avatar);
    setTimeout(() => setCallingUid(null), 8000);
  };

  const openDM = (u) => {
    dmStore.markRead(u.uid);
    setDmPeer({ uid: u.uid, displayName: u.displayName });
  };

  if (dmPeer) return <DMChat peer={dmPeer} myUid={user?.uid} onBack={() => setDmPeer(null)} />;

  const totalUnread = dmStore.getTotalUnread();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Users size={13} className="text-slate-500" />
          <span className="font-bold text-white text-xs uppercase tracking-widest" style={{ fontFamily: 'Syne, sans-serif' }}>Online</span>
          {others.length > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--success-dim)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <Circle size={5} className="text-emerald-400 fill-emerald-400" />
              <span className="text-xs text-emerald-400 font-bold">{others.length}</span>
            </span>
          )}
          {totalUnread > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>
              <Bell size={9} /> {totalUnread}
            </span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-500 hover:text-white transition-all"
            style={{ background: 'rgba(255,255,255,0.04)' }}>
            <X size={12} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {others.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
              <Users size={17} className="text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No one else online</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Invite teammates to collaborate</p>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {others.map(u => {
              const unread = dmStore.getUnread(u.uid);
              return (
                <div key={u.uid}
                  className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl transition-all group cursor-default"
                  style={{ ':hover': { background: 'rgba(255,255,255,0.03)' } }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div className="relative flex-shrink-0">
                    <Avatar name={u.displayName} size="sm" />
                    <div className="online-dot" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{u.displayName}</p>
                    {u.status
                      ? <p className="text-xs truncate mt-0.5" style={{ color: 'var(--accent)', opacity: 0.8 }}>🎯 {u.status}</p>
                      : <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Available</p>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* DM button — always visible, shows unread badge */}
                    <div className="relative">
                      <button onClick={() => openDM(u)}
                        title={`Message ${u.displayName}`}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                        style={{ background: unread > 0 ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = unread > 0 ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.12)'; e.currentTarget.style.color = '#818cf8'; }}>
                        <MessageSquare size={12} />
                      </button>
                      {unread > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                          style={{ background: '#6366f1', color: '#fff' }}>
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </div>
                    {/* Call button */}
                    <button onClick={() => handleCall(u)}
                      disabled={!!directCallStatus || !!callingUid}
                      title={`Call ${u.displayName}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)' }}
                      onMouseEnter={e => { if (!directCallStatus && !callingUid) { e.currentTarget.style.background = 'var(--success)'; e.currentTarget.style.color = '#fff'; }}}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--success-dim)'; e.currentTarget.style.color = 'var(--success)'; }}>
                      {callingUid === u.uid
                        ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : <Phone size={12} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 flex-shrink-0 flex items-center gap-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="relative flex-shrink-0">
          <Avatar name={user?.displayName || '?'} size="xs" />
          <div className="online-dot" style={{ width: 7, height: 7 }} />
        </div>
        <p className="text-xs font-medium truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{user?.displayName}</p>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
          style={{ background: 'var(--success-dim)', color: 'var(--success)' }}>You</span>
      </div>
    </div>
  );
};
