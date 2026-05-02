import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Monitor,
  MonitorOff, MessageSquare, X, Send,
} from 'lucide-react';
import { useOnlineStore } from '../../store/onlineStore';
import { useDirectCall } from '../../hooks/useDirectCall';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';
import { formatMessageTime } from '../../utils/formatters';

// ── VideoBox: always assigns srcObject, polls for track readyState ──────────
const VideoBox = ({ stream, name, isLocal, muted = false, screenSharing = false, className = '' }) => {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!stream) { el.srcObject = null; setHasVideo(false); return; }

    el.srcObject = stream;
    el.play().catch(() => {});

    const update = () => {
      const tracks = stream.getVideoTracks();
      setHasVideo(tracks.length > 0 && tracks.some(t => t.readyState === 'live'));
    };
    update();
    stream.addEventListener('addtrack', update);
    stream.addEventListener('removetrack', update);
    const poll = setInterval(update, 500);
    return () => {
      stream.removeEventListener('addtrack', update);
      stream.removeEventListener('removetrack', update);
      clearInterval(poll);
    };
  }, [stream]);

  return (
    <div className={`relative overflow-hidden ${className}`}
      style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
      <video ref={videoRef} autoPlay playsInline muted={muted}
        className="w-full h-full object-cover"
        style={{ transform: isLocal && !screenSharing ? 'scaleX(-1)' : 'none', opacity: hasVideo ? 1 : 0, transition: 'opacity 0.3s' }} />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Avatar name={name} size="xl" />
            {!isLocal && (
              <div className="flex gap-1">
                {[0,150,300].map(d => (
                  <div key={d} className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
      <span className="absolute bottom-2 left-3 text-xs font-medium text-white/90 drop-shadow">
        {name}{isLocal ? ' (You)' : ''}
      </span>
    </div>
  );
};

// ── Control button ────────────────────────────────────────────────────────────

const Btn = ({ onClick, isOff, accentOn, icon, label, size = 'md' }) => {
  const base = isOff
    ? 'bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white'
    : accentOn
    ? 'bg-amber-400/15 hover:bg-amber-400/25 text-amber-400'
    : 'bg-white/6 hover:bg-white/12 text-slate-300 hover:text-white';
  const sz = size === 'lg' ? 'w-14 h-14 rounded-2xl' : 'w-11 h-11 rounded-xl';
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 group cursor-pointer select-none">
      <div className={`${sz} ${base} flex items-center justify-center transition-all duration-200 group-hover:scale-105 group-active:scale-95`}>
        {icon}
      </div>
      {label && (
        <span className="text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors" style={{ fontFamily: 'Syne, sans-serif' }}>
          {label}
        </span>
      )}
    </button>
  );
};

// ── Main ─────────────────────────────────────────────────────────────────────
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
  const [callDuration, setCallDuration] = useState(0);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (directCallStatus !== 'connected') return;
    const t = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [directCallStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!showChat) setUnreadCount(c => c + 1);
  }, [directMessages.length]);

  useEffect(() => { if (showChat) setUnreadCount(0); }, [showChat]);

  if (!activeDirectCall) return null;
  const { peerName, peerUid, localStream, remoteStream } = activeDirectCall;
  const peerMedia = peerMediaState[peerUid] || {};

  const fmt = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  const statusLabel = directCallStatus === 'calling' ? 'Ringing...'
    : directCallStatus === 'connected' ? fmt(callDuration)
    : 'Connecting...';

  const handleSend = () => {
    if (!chatInput.trim()) return;
    sendDirectMessage(chatInput);
    setChatInput('');
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col animate-fade-in" style={{ background: 'var(--bg-primary)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar name={peerName} size="md" />
            {directCallStatus === 'connected' && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2"
                style={{ borderColor: 'var(--bg-secondary)' }} />
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
          {peerMedia.audioEnabled === false && (
            <div className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/15">
              <MicOff size={11} /> Muted
            </div>
          )}
          {peerMedia.videoEnabled === false && (
            <div className="flex items-center gap-1 text-xs text-slate-400 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
              <VideoOff size={11} /> Cam off
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* Videos */}
        <div className="flex-1 flex flex-col sm:flex-row gap-3 p-3 sm:p-4 min-h-0 relative">
          {/* Remote — large */}
          <VideoBox stream={remoteStream} name={peerName} className="flex-1 min-h-0" />

          {/* Local — pip overlay on mobile, panel on desktop */}
          <div className="absolute bottom-16 right-4 w-28 h-36 sm:static sm:w-52 sm:h-auto sm:flex-none rounded-2xl overflow-hidden shadow-2xl border border-white/8 sm:border-0">
            <VideoBox
              stream={localStream} name={user?.displayName || 'You'}
              isLocal muted screenSharing={directScreenSharing}
              className="w-full h-full"
            />
          </div>
        </div>

        {/* Chat panel */}
        {showChat && (
          <div className="w-72 flex-shrink-0 flex flex-col border-l animate-slide-in-right"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold text-sm text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Chat</span>
              <button onClick={() => setShowChat(false)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all">
                <X size={13} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {directMessages.length === 0 && (
                <p className="text-center text-slate-600 text-xs pt-8">No messages yet</p>
              )}
              {directMessages.map(msg => {
                const isMe = msg.uid === user?.uid;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${isMe ? 'bg-amber-400/15 text-amber-50 rounded-tr-sm' : 'bg-white/5 text-slate-200 rounded-tl-sm'}`}>
                      <p>{msg.message}</p>
                      <p className={`text-xs mt-1 ${isMe ? 'text-amber-400/50' : 'text-slate-600'}`}>
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
                <input className="input-field flex-1 py-2 text-sm" placeholder="Message..."
                  value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}} />
                <button onClick={handleSend} disabled={!chatInput.trim()}
                  className="w-9 h-9 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-30 flex items-center justify-center flex-shrink-0 transition-all">
                  <Send size={14} style={{ color: '#0b0e14' }} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 sm:gap-5 px-4 py-3 sm:py-4 flex-wrap"
        style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
        <Btn onClick={toggleDirectAudio} isOff={!directAudioEnabled}
          icon={directAudioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          label={directAudioEnabled ? 'Mute' : 'Unmute'} />
        <Btn onClick={toggleDirectVideo} isOff={!directVideoEnabled}
          icon={directVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          label={directVideoEnabled ? 'Cam off' : 'Cam on'} />
        <Btn
          onClick={directScreenSharing ? stopDirectScreenShare : startDirectScreenShare}
          accentOn={directScreenSharing}
          icon={directScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
          label={directScreenSharing ? 'Stop' : 'Share'} />

        {/* End */}
        <button onClick={endDirectCall} className="flex flex-col items-center gap-1.5 group cursor-pointer mx-1">
          <div className="w-14 h-14 rounded-2xl bg-red-500 hover:bg-red-400 flex items-center justify-center transition-all duration-200 shadow-lg shadow-red-500/25 group-hover:scale-105 group-active:scale-95">
            <PhoneOff size={20} className="text-white" />
          </div>
          <span className="text-[11px] text-slate-500 group-hover:text-red-400 transition-colors" style={{ fontFamily: 'Syne, sans-serif' }}>End</span>
        </button>

        <div className="relative">
          <Btn onClick={() => setShowChat(v => !v)} accentOn={showChat}
            icon={<MessageSquare size={18} />} label="Chat" />
          {unreadCount > 0 && !showChat && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 text-[10px] font-bold flex items-center justify-center z-10" style={{ color: '#0b0e14' }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
