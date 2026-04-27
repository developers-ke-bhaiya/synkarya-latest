import React, { useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Monitor,
  MonitorOff, MessageSquare, X, Send, ChevronDown
} from 'lucide-react';
import { useOnlineStore } from '../../store/onlineStore';
import { useDirectCall } from '../../hooks/useDirectCall';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';
import { formatMessageTime } from '../../utils/formatters';

// ── Video Box ─────────────────────────────────────────────────────────────────
const VideoBox = ({ stream, name, isLocal, muted = false, screenSharing = false, className = '' }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  const hasVideo = stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);

  return (
    <div className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      {hasVideo ? (
        <video ref={ref} autoPlay playsInline muted={muted}
          className="w-full h-full object-cover"
          style={{ transform: isLocal && !screenSharing ? 'scaleX(-1)' : 'none' }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center min-h-[120px]">
          <Avatar name={name} size="xl" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
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
  const sz = size === 'lg'
    ? 'w-14 h-14 rounded-2xl'
    : 'w-11 h-11 rounded-xl';

  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1.5 group cursor-pointer select-none`}>
      <div className={`${sz} ${base} flex items-center justify-center
        transition-all duration-200 group-hover:scale-105 group-active:scale-95`}>
        {icon}
      </div>
      {label && (
        <span className="text-xs text-slate-500 group-hover:text-slate-300 transition-colors"
          style={{ fontFamily: 'Syne, sans-serif' }}>{label}</span>
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

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendDirectMessage(chatInput);
    setChatInput('');
  };

  const statusLabel = directCallStatus === 'calling'
    ? 'Calling...'
    : directCallStatus === 'ringing'
    ? 'Ringing...'
    : 'Connected';

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar name={peerName} size="md" />
            {directCallStatus === 'connected' && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full
                bg-emerald-400 border-2 border-[var(--bg-secondary)]" />
            )}
          </div>
          <div>
            <p className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
              {peerName}
            </p>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full
                ${directCallStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
              <p className="text-xs text-slate-400">{statusLabel}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 bg-white/5 px-2.5 py-1 rounded-lg
            border border-white/5 hidden sm:block">
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

          {/* Local — small overlay on mobile, side panel on desktop */}
          <div className="
            sm:w-56 h-36 sm:h-auto
            absolute bottom-16 right-4 w-32 sm:static
            rounded-2xl overflow-hidden shadow-2xl sm:shadow-none
            border border-white/10 sm:border-0
          ">
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
          <div className="w-72 flex-shrink-0 flex flex-col border-l"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>

            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold text-sm text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
                Chat
              </span>
              <button onClick={() => setShowChat(false)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center
                  text-slate-400 hover:text-white transition-all">
                <X size={13} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {directMessages.length === 0 && (
                <p className="text-center text-slate-600 text-xs pt-6">
                  No messages yet
                </p>
              )}
              {directMessages.map((msg) => {
                const isMe = msg.uid === user?.uid;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm
                      ${isMe
                        ? 'bg-amber-400/20 text-amber-50 rounded-tr-sm'
                        : 'bg-white/5 text-slate-200 rounded-tl-sm'}`}>
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

            {/* Input */}
            <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 py-2 text-sm"
                  placeholder="Message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); }}}
                />
                <button onClick={handleSendChat} disabled={!chatInput.trim()}
                  className="w-9 h-9 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-30
                    flex items-center justify-center flex-shrink-0 transition-all">
                  <Send size={14} className="text-navy-950" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Control bar ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 sm:py-4 flex-wrap"
        style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>

        {/* Mic */}
        <Btn
          onClick={toggleDirectAudio}
          isOff={!directAudioEnabled}
          icon={directAudioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          label={directAudioEnabled ? 'Mute' : 'Unmute'}
        />

        {/* Camera */}
        <Btn
          onClick={toggleDirectVideo}
          isOff={!directVideoEnabled}
          icon={directVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          label={directVideoEnabled ? 'Stop video' : 'Start video'}
        />

        {/* Screen share */}
        <Btn
          onClick={directScreenSharing ? stopDirectScreenShare : startDirectScreenShare}
          isOff={directScreenSharing}
          accentOn={directScreenSharing}
          icon={directScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
          label={directScreenSharing ? 'Stop share' : 'Share screen'}
        />

        {/* End call */}
        <button onClick={endDirectCall}
          className="flex flex-col items-center gap-1.5 group cursor-pointer mx-1">
          <div className="w-14 h-14 rounded-2xl bg-red-500 hover:bg-red-400
            flex items-center justify-center transition-all duration-200
            shadow-lg shadow-red-500/30 group-hover:scale-105 group-active:scale-95">
            <PhoneOff size={20} className="text-white" />
          </div>
          <span className="text-xs text-slate-500 group-hover:text-red-400 transition-colors"
            style={{ fontFamily: 'Syne, sans-serif' }}>End</span>
        </button>

        {/* Chat toggle with unread badge */}
        <div className="relative">
          <Btn
            onClick={() => setShowChat((v) => !v)}
            accentOn={showChat}
            icon={<MessageSquare size={18} />}
            label="Chat"
          />
          {unreadCount > 0 && !showChat && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400
              text-xs font-bold text-navy-950 flex items-center justify-center z-10">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
