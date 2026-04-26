import React from 'react';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  PhoneOff, MessageSquare, Users, ClipboardList
} from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { useChatStore } from '../../store/chatStore';
import { useWebRTC } from '../../hooks/useWebRTC';

export const ControlBar = ({ onShowAttendance, onShowParticipants }) => {
  const { audioEnabled, videoEnabled, isScreenSharing } = useCallStore();
  const { toggleChat, unreadCount } = useChatStore();
  const { toggleAudio, toggleVideo, startScreenShare, stopScreenShare, endCall } = useWebRTC();

  const handleScreenShare = () => {
    if (isScreenSharing) stopScreenShare();
    else startScreenShare();
  };

  return (
    <div className="flex items-center justify-center gap-3 px-6 py-4 relative"
      style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>

      {/* Left cluster */}
      <div className="flex items-center gap-2 mr-4">
        <ControlBtn
          onClick={toggleAudio}
          active={audioEnabled}
          icon={audioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          label={audioEnabled ? 'Mute' : 'Unmute'}
          dangerWhenOff
          isOff={!audioEnabled}
        />
        <ControlBtn
          onClick={toggleVideo}
          active={videoEnabled}
          icon={videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          label={videoEnabled ? 'Stop video' : 'Start video'}
          dangerWhenOff
          isOff={!videoEnabled}
        />
        <ControlBtn
          onClick={handleScreenShare}
          active={!isScreenSharing}
          icon={isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
          label={isScreenSharing ? 'Stop share' : 'Share screen'}
          isOff={isScreenSharing}
          accentWhenOn={isScreenSharing}
        />
      </div>

      {/* End call — center */}
      <button
        onClick={endCall}
        className="flex flex-col items-center gap-1.5 group cursor-pointer"
        title="End call"
      >
        <div className="w-14 h-14 rounded-2xl bg-red-500 hover:bg-red-400
          flex items-center justify-center transition-all duration-200
          shadow-lg shadow-red-500/30 group-hover:scale-105 group-active:scale-95">
          <PhoneOff size={22} className="text-white" />
        </div>
        <span className="text-xs text-slate-500 group-hover:text-red-400 transition-colors"
          style={{ fontFamily: 'Syne, sans-serif' }}>
          End
        </span>
      </button>

      {/* Right cluster */}
      <div className="flex items-center gap-2 ml-4">
        <ControlBtn
          onClick={onShowParticipants}
          active={true}
          icon={<Users size={18} />}
          label="Participants"
        />
        <div className="relative">
          <ControlBtn
            onClick={toggleChat}
            active={true}
            icon={<MessageSquare size={18} />}
            label="Chat"
          />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400
              text-xs font-bold text-navy-950 flex items-center justify-center z-10">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <ControlBtn
          onClick={onShowAttendance}
          active={true}
          icon={<ClipboardList size={18} />}
          label="Attendance"
        />
      </div>
    </div>
  );
};

const ControlBtn = ({ onClick, icon, label, isOff = false, accentWhenOn = false }) => {
  const getBg = () => {
    if (isOff) return 'bg-red-500/15 hover:bg-red-500/25 text-red-400';
    if (accentWhenOn) return 'bg-amber-400/15 hover:bg-amber-400/25 text-amber-400';
    return 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white';
  };

  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 group cursor-pointer">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center
        transition-all duration-200 group-hover:scale-105 group-active:scale-95 ${getBg()}`}>
        {icon}
      </div>
      <span className="text-xs text-slate-500 group-hover:text-slate-300 transition-colors"
        style={{ fontFamily: 'Syne, sans-serif' }}>
        {label}
      </span>
    </button>
  );
};
