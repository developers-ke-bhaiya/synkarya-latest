import React from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff, MessageSquare, Users, ClipboardList } from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { useChatStore } from '../../store/chatStore';
import { useWebRTC } from '../../hooks/useWebRTC';

export const ControlBar = ({ onShowAttendance, onShowParticipants }) => {
  const { audioEnabled, videoEnabled, isScreenSharing } = useCallStore();
  const { toggleChat, unreadCount } = useChatStore();
  const { toggleAudio, toggleVideo, startScreenShare, stopScreenShare, endCall } = useWebRTC();

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-6 py-3 sm:py-4 flex-wrap"
      style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>

      {/* Mic */}
      <CtrlBtn
        onClick={toggleAudio}
        isOff={!audioEnabled}
        icon={audioEnabled ? <Mic size={17} /> : <MicOff size={17} />}
        label={audioEnabled ? 'Mute' : 'Unmute'}
      />

      {/* Camera */}
      <CtrlBtn
        onClick={toggleVideo}
        isOff={!videoEnabled}
        icon={videoEnabled ? <Video size={17} /> : <VideoOff size={17} />}
        label={videoEnabled ? 'Stop video' : 'Start video'}
      />

      {/* Screen share - hidden on mobile */}
      <div className="hidden sm:block">
        <CtrlBtn
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          isOff={isScreenSharing}
          accentWhenOn={isScreenSharing}
          icon={isScreenSharing ? <MonitorOff size={17} /> : <Monitor size={17} />}
          label={isScreenSharing ? 'Stop share' : 'Share screen'}
        />
      </div>

      {/* End call */}
      <button onClick={endCall} className="flex flex-col items-center gap-1 group cursor-pointer mx-1">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-red-500 hover:bg-red-400
          flex items-center justify-center transition-all duration-200
          shadow-lg shadow-red-500/30 group-hover:scale-105 group-active:scale-95">
          <PhoneOff size={20} className="text-white" />
        </div>
        <span className="text-xs text-slate-500 group-hover:text-red-400 transition-colors"
          style={{ fontFamily: 'Syne, sans-serif' }}>End</span>
      </button>

      {/* Participants */}
      <CtrlBtn onClick={onShowParticipants} icon={<Users size={17} />} label="Participants" />

      {/* Chat with badge */}
      <div className="relative">
        <CtrlBtn onClick={toggleChat} icon={<MessageSquare size={17} />} label="Chat" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-amber-400
            text-xs font-bold text-navy-950 flex items-center justify-center z-10">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>

      {/* Attendance */}
      <CtrlBtn onClick={onShowAttendance} icon={<ClipboardList size={17} />} label="Attendance" />
    </div>
  );
};

const CtrlBtn = ({ onClick, icon, label, isOff = false, accentWhenOn = false }) => {
  const bg = isOff
    ? 'bg-red-500/15 hover:bg-red-500/25 text-red-400'
    : accentWhenOn
    ? 'bg-amber-400/15 hover:bg-amber-400/25 text-amber-400'
    : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white';

  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 group cursor-pointer">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center
        transition-all duration-200 group-hover:scale-105 group-active:scale-95 ${bg}`}>
        {icon}
      </div>
      <span className="text-xs text-slate-500 group-hover:text-slate-300 transition-colors hidden sm:block"
        style={{ fontFamily: 'Syne, sans-serif' }}>
        {label}
      </span>
    </button>
  );
};
