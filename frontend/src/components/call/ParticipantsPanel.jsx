import React from 'react';
import { X, MicOff, VideoOff, Monitor, Crown } from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';

export const ParticipantsPanel = ({ onClose }) => {
  const { peerInfo, audioEnabled, videoEnabled, isScreenSharing, currentRoom } = useCallStore();
  const { user } = useAuthStore();

  const peers = Array.from(peerInfo.entries());
  const total = 1 + peers.length;

  return (
    <div className="fixed inset-y-0 right-0 w-80 z-50 flex flex-col animate-slide-in-right shadow-2xl"
      style={{ background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Participants
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{total} in call</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center
            text-slate-400 hover:text-white transition-all">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Local user */}
        <ParticipantRow
          displayName={user?.displayName || 'You'}
          isLocal
          isHost={currentRoom?.hostUid === user?.uid}
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          screenSharing={isScreenSharing}
        />

        {/* Remote peers */}
        {peers.map(([uid, info]) => (
          <ParticipantRow
            key={uid}
            displayName={info.displayName || 'Participant'}
            isHost={currentRoom?.hostUid === uid}
            audioEnabled={info.audioEnabled !== false}
            videoEnabled={info.videoEnabled !== false}
            screenSharing={info.screenSharing || false}
          />
        ))}
      </div>
    </div>
  );
};

const ParticipantRow = ({ displayName, isLocal, isHost, audioEnabled, videoEnabled, screenSharing }) => (
  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/3 transition-colors">
    <Avatar name={displayName} size="sm" />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-white truncate">{displayName}</span>
        {isLocal && <span className="text-xs text-slate-500">(You)</span>}
        {isHost && <Crown size={12} className="text-amber-400 flex-shrink-0" />}
      </div>
      {screenSharing && (
        <span className="text-xs text-amber-400 flex items-center gap-1 mt-0.5">
          <Monitor size={10} /> Sharing screen
        </span>
      )}
    </div>
    <div className="flex items-center gap-1.5">
      {!audioEnabled && <MicOff size={13} className="text-red-400" />}
      {!videoEnabled && <VideoOff size={13} className="text-slate-500" />}
    </div>
  </div>
);
