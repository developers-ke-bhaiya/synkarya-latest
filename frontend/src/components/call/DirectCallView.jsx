import React, { useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Monitor,
  MonitorOff, MessageSquare, X, Send
} from 'lucide-react';
import { useOnlineStore } from '../../store/onlineStore';
import { useDirectCall } from '../../hooks/useDirectCall';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';
import { formatMessageTime } from '../../utils/formatters';

// ── FIX: VideoBox uses srcObject directly on ref, not state ──────────────────
const VideoBox = ({ stream, name, isLocal, muted = false, screenSharing = false, className = '' }) => {
  const ref = useRef(null);

  // FIX: always sync srcObject when stream changes, including null
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stream) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
    } else {
      el.srcObject = null;
    }
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      {/* Always render video — hide it when no video available */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover transition-opacity duration-300 ${hasVideo ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
        style={{ transform: isLocal && !screenSharing ? 'scaleX(-1)' : 'none' }}
      />

      {/* Avatar fallback */}
      {!hasVideo && (
        <div className="w-full h-full flex items-center justify-center min-h-[120px]">
          <div className="flex flex-col items-center gap-3">
            <Avatar name={name} size="xl" />
            {!isLocal && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom gradient */}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
      <span className="absolute bottom-2 left-3 text-xs font-medium text-white/90 drop-shadow">
        {name}{isLocal ? ' (You)' : ''}
      </span>
    </div>
  );
};

// ── Control Button ────────────────────────────────────────────────────────────
const Btn = ({ onClick, isOff, accentOn, icon, label, size = 'md' }) => {
  const base = isOff
    ? 'bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white'
    : accentOn
    ? 'bg-amber-400/20 hover:bg-amber-400/30 text-amber-400'
    : 'bg-white/8 hover:bg-white/15 text-slate-300 hover:text-white';
  const sz = size === 'lg' ? 'w-14 h-14 rounded-2xl' : 'w-11 h-11 rounded-xl';

  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 group cursor-pointer select-none">
      <div className={`${sz} ${base} flex items-center justify-center transition-all duration-200 group-hover:scale-105 group-active:scale-95`}>
        {icon}
      </div>
      {label && (
        <span className="text-xs text-slate-500 group-hover:text-slate-300 transition-colors" style={{ fontFamily: 'Syne, sans-serif' }}>
          {label}
        </span>
      )}
    </button>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
export const DirectCallView = () => {
  const {
    activeDirectCall, directCallStatus,
    directAudioEnabled, directVideoEnabled, directScreenSharing,
    peerMediaState, directMessages,
  } = useOnlineStore();
  const {
    endDirectCall, toggleDirectAudio, toggleDirectVideo,
    startDirectScreenShare, stopDirectScreenShare, sendDirectMessage,
  } = useDirectCall();
  const { user } = useAuthStore();

  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);
  const [callDuration, setCallDuration] = useState(0);

  // Call timer
  useEffect(() => {
    if (directCallStatus !== 'connected') return;
    const t = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [directCallStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!showChat && directMessages.length > 0) {
      setUnreadCount((c) => c + 1);
    }
  }, [directMessages]);

  useEffect(() => {
    if (showChat) setUnreadCount(0);
  }, [showChat]);

  if (!activeDirectCall) return null;

  const { peerName, peerAvatar, peerUid, localStream, remoteStream } = activeDirectCall;
  const peerMedia = peerMediaState[peerUid] || {};

  const formatDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendDirectMessage(chatInput);
    setChatInput('');
  };

  const statusLabel = directCallStatus === 'calling'
    ? 'Calling...'
    : directCallStatus === 'ringing'
    ? 'Ringing...'
    : directCallStatus === 'connected'
    ? formatDuration(callDuration)
    : 'Connecting...';

  return (
    <div className="fixed inset-0 z-40 flex flex-col animate-fade-in" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar name={peerName} size="md" />
            {directCallStatus === 'connected' && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[var(--bg-secondary)]" />
            )}
          </div>
          <div>
            <p className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>{peerName}</p>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${directCallStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
              <p className="text-xs text-slate-400 tabular-nums">{statusLabel}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Peer media indicators */}
          <div className="flex items-center gap-1">
            {peerMedia.audioEnabled === false && (
              <div className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20">
                <MicOff size={11} /> Muted
              </div>
            )}
            {peerMedia.videoEnabled === false && (
              <div className="flex items-center gap-1 text-xs text-slate-400 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                <VideoOff size={11} /> Camera off
              </div>
            )}
          </div>
          <span className="text-xs text-slate-600 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 hidden sm:block">
            Private call
          </span>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* Video area */}
        <div className="flex-1 flex flex-col sm:flex-row gap-3 p-3 sm:p-4 min-h-0 relative">

          {/* Remote — large */}
          <VideoBox
            stream={remoteStream}
            name={peerName}
            className="flex-1 min-h-0"
          />

          {/* Local — small overlay */}
          <div className="sm:w-56 h-36 sm:h-auto absolute bottom-16 right-4 w-32 sm:static rounded-2xl overflow-hidden shadow-2xl sm:shadow-none border border-white/10 sm:border-0">
            <VideoBox
              stream={localStream}
              name={user?.displayName || 'You'}
              isLocal
              screenSharing={directScreenSharing}
              muted
              className="w-full h-full sm:h-full"
            />
          </div>
        </div>

        {/* Chat panel */}
        {showChat && (
          <div
            className="w-72 flex-shrink-0 flex flex-col border-l animate-slide-in-right"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold text-sm text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Chat</span>
              <button
                onClick={() => setShowChat(false)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all"
              >
                <X size={13} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {directMessages.length === 0 && (
                <p className="text-center text-slate-600 text-xs pt-6">No messages yet</p>
              )}
              {directMessages.map((msg) => {
                const isMe = msg.uid === user?.uid;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${isMe ? 'bg-amber-400/20 text-amber-50 rounded-tr-sm' : 'bg-white/5 text-slate-200 rounded-tl-sm'}`}>
                      <p>{msg.message}</p>
                      <p className={`text-xs mt-1 ${isMe ? 'text-amber-400/60' : 'text-slate-600'}`}>
                        {formatMessageTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 py-2 text-sm"
                  placeholder="Message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim()}
                  className="w-9 h-9 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-30 flex items-center justify-center flex-shrink-0 transition-all"
                >
                  <Send size={14} className="text-navy-950" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Control bar ────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-center gap-2 sm:gap-4 px-4 py-3 sm:py-4 flex-wrap"
        style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}
      >
        <Btn
          onClick={toggleDirectAudio}
          isOff={!directAudioEnabled}
          icon={directAudioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          label={directAudioEnabled ? 'Mute' : 'Unmute'}
        />
        <Btn
          onClick={toggleDirectVideo}
          isOff={!directVideoEnabled}
          icon={directVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          label={directVideoEnabled ? 'Stop video' : 'Start video'}
        />
        <Btn
          onClick={directScreenSharing ? stopDirectScreenShare : startDirectScreenShare}
          accentOn={directScreenSharing}
          icon={directScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
          label={directScreenSharing ? 'Stop share' : 'Share screen'}
        />

        {/* End call */}
        <button onClick={endDirectCall} className="flex flex-col items-center gap-1.5 group cursor-pointer mx-1">
          <div className="w-14 h-14 rounded-2xl bg-red-500 hover:bg-red-400 flex items-center justify-center transition-all duration-200 shadow-lg shadow-red-500/30 group-hover:scale-105 group-active:scale-95">
            <PhoneOff size={20} className="text-white" />
          </div>
          <span className="text-xs text-slate-500 group-hover:text-red-400 transition-colors" style={{ fontFamily: 'Syne, sans-serif' }}>End</span>
        </button>

        {/* Chat toggle */}
        <div className="relative">
          <Btn
            onClick={() => setShowChat((v) => !v)}
            accentOn={showChat}
            icon={<MessageSquare size={18} />}
            label="Chat"
          />
          {unreadCount > 0 && !showChat && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 text-xs font-bold text-navy-950 flex items-center justify-center z-10">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
