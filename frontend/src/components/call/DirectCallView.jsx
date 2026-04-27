import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor } from 'lucide-react';
import { useOnlineStore } from '../../store/onlineStore';
import { useDirectCall } from '../../hooks/useDirectCall';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';

const VideoBox = ({ stream, name, isLocal, muted = false }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().some((t) => t.enabled);

  return (
    <div className="relative rounded-2xl overflow-hidden flex-1"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', minHeight: '200px' }}>
      {hasVideo ? (
        <video ref={ref} autoPlay playsInline muted={muted}
          className="w-full h-full object-cover"
          style={{ transform: isLocal ? 'scaleX(-1)' : 'none' }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Avatar name={name} size="xl" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
      <span className="absolute bottom-3 left-3 text-sm font-medium text-white">
        {name}{isLocal ? ' (You)' : ''}
      </span>
    </div>
  );
};

export const DirectCallView = () => {
  const { activeDirectCall, directCallStatus, directAudioEnabled, directVideoEnabled, peerMediaState } = useOnlineStore();
  const { endDirectCall, toggleDirectAudio, toggleDirectVideo } = useDirectCall();
  const { user } = useAuthStore();

  if (!activeDirectCall) return null;

  const { peerName, peerAvatar, localStream, remoteStream } = activeDirectCall;
  const peerMedia = peerMediaState[activeDirectCall.peerUid] || {};

  return (
    <div className="fixed inset-0 z-40 flex flex-col"
      style={{ background: 'var(--bg-primary)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <Avatar name={peerName} size="sm" />
          <div>
            <p className="font-bold text-white text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>
              {peerName}
            </p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-xs text-emerald-400">
                {directCallStatus === 'calling' ? 'Calling...' :
                  directCallStatus === 'ringing' ? 'Ringing...' : 'Connected'}
              </p>
            </div>
          </div>
        </div>
        <span className="text-xs text-slate-500 font-mono bg-white/5 px-2 py-1 rounded-lg">
          Private call
        </span>
      </div>

      {/* Video area */}
      <div className="flex-1 flex flex-col sm:flex-row gap-3 p-3 sm:p-4 min-h-0">
        {/* Remote */}
        <VideoBox stream={remoteStream} name={peerName} muted={false} />
        {/* Local (small on mobile, side by side on desktop) */}
        <div className="sm:w-64 h-40 sm:h-auto">
          <VideoBox stream={localStream} name={user?.displayName || 'You'} isLocal muted />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 py-4 px-4"
        style={{ background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
        <CtrlBtn
          onClick={toggleDirectAudio}
          isOff={!directAudioEnabled}
          icon={directAudioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          label={directAudioEnabled ? 'Mute' : 'Unmute'}
        />
        <CtrlBtn
          onClick={toggleDirectVideo}
          isOff={!directVideoEnabled}
          icon={directVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          label={directVideoEnabled ? 'Stop video' : 'Start video'}
        />

        {/* End call */}
        <button onClick={endDirectCall}
          className="flex flex-col items-center gap-1.5 group cursor-pointer">
          <div className="w-14 h-14 rounded-2xl bg-red-500 hover:bg-red-400
            flex items-center justify-center transition-all duration-200
            shadow-lg shadow-red-500/30 group-hover:scale-105 group-active:scale-95">
            <PhoneOff size={20} className="text-white" />
          </div>
          <span className="text-xs text-slate-500 group-hover:text-red-400 transition-colors"
            style={{ fontFamily: 'Syne, sans-serif' }}>End</span>
        </button>
      </div>
    </div>
  );
};

const CtrlBtn = ({ onClick, icon, label, isOff }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1.5 group cursor-pointer">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center
      transition-all duration-200 group-hover:scale-105 group-active:scale-95
      ${isOff ? 'bg-red-500/15 text-red-400' : 'bg-white/5 hover:bg-white/10 text-slate-300'}`}>
      {icon}
    </div>
    <span className="text-xs text-slate-500 group-hover:text-slate-300 transition-colors"
      style={{ fontFamily: 'Syne, sans-serif' }}>{label}</span>
  </button>
);
