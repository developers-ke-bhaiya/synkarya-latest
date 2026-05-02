import React from 'react';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  PhoneOff, MessageSquare, Users, ClipboardList,
} from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { useChatStore } from '../../store/chatStore';
import { useWebRTC } from '../../hooks/useWebRTC';

export const ControlBar = ({ onShowAttendance, onShowParticipants }) => {
  const { audioEnabled, videoEnabled, isScreenSharing } = useCallStore();
  const { toggleChat, unreadCount } = useChatStore();
  const { toggleAudio, toggleVideo, startScreenShare, stopScreenShare, endCall } = useWebRTC();

  return (
    <div
      className="flex-shrink-0 flex items-center justify-center flex-wrap gap-2 px-2 py-3 sm:px-6 sm:py-4 sm:gap-3"
      style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}
    >
      <Btn onClick={toggleAudio} isOff={!audioEnabled}
        icon={audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
        label={audioEnabled ? 'Mute' : 'Unmute'} />

      <Btn onClick={toggleVideo} isOff={!videoEnabled}
        icon={videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
        label={videoEnabled ? 'Cam off' : 'Cam on'} />

      {/* Screen share — shown on all devices */}
      <Btn
        onClick={isScreenSharing ? stopScreenShare : startScreenShare}
        accentOn={isScreenSharing}
        icon={isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
        label={isScreenSharing ? 'Stop' : 'Share'}
      />

      {/* End call — bigger, red */}
      <button onClick={endCall}
        className="flex flex-col items-center gap-1 group cursor-pointer mx-1">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-red-500 hover:bg-red-400
          flex items-center justify-center transition-all duration-200
          shadow-lg shadow-red-500/25 group-hover:scale-105 group-active:scale-95">
          <PhoneOff size={19} className="text-white" />
        </div>
        <span className="text-[11px] text-slate-500 group-hover:text-red-400 transition-colors"
          style={{ fontFamily: 'Syne, sans-serif' }}>End</span>
      </button>

      <Btn onClick={onShowParticipants} icon={<Users size={18} />} label="People" />

      <div className="relative">
        <Btn onClick={toggleChat} icon={<MessageSquare size={18} />} label="Chat" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-400
            text-[10px] font-bold flex items-center justify-center z-10" style={{ color: '#0b0e14' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>

      <Btn onClick={onShowAttendance} icon={<ClipboardList size={18} />} label="Attend." />
    </div>
  );
};

const Btn = ({ onClick, icon, label, isOff = false, accentOn = false }) => {
  const bg = isOff
    ? 'bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white'
    : accentOn
    ? 'bg-amber-400/15 hover:bg-amber-400/25 text-amber-400'
    : 'bg-white/6 hover:bg-white/12 text-slate-300 hover:text-white';

  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1 group cursor-pointer select-none">
      <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center
        transition-all duration-200 group-hover:scale-105 group-active:scale-95 ${bg}`}>
        {icon}
      </div>
      <span className="text-[10px] sm:text-xs text-slate-500 group-hover:text-slate-300 transition-colors"
        style={{ fontFamily: 'Syne, sans-serif' }}>
        {label}
      </span>
    </button>
  );
};
