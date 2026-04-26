import { useCallStore } from '../../store/callStore';
import { useAuthStore } from '../../store/authStore';
import { Mic, MicOff, Video, VideoOff, Crown } from 'lucide-react';
import clsx from 'clsx';

const ParticipantRow = ({ uid, displayName, audioEnabled = true, videoEnabled = true, isLocal, isHost }) => (
  <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-all group">
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xs font-bold text-navy-950 flex-shrink-0"
      style={{ fontFamily: 'Syne, sans-serif' }}>
      {displayName?.slice(0, 2).toUpperCase()}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm text-white truncate">{displayName} {isLocal && <span className="text-amber-400">(You)</span>}</p>
    </div>
    <div className="flex items-center gap-1">
      {isHost && <Crown size={12} className="text-amber-400" />}
      {audioEnabled ? (
        <Mic size={13} className="text-slate-500" />
      ) : (
        <MicOff size={13} className="text-red-400" />
      )}
      {videoEnabled ? (
        <Video size={13} className="text-slate-500" />
      ) : (
        <VideoOff size={13} className="text-red-400" />
      )}
    </div>
  </div>
);

const ParticipantsSidebar = () => {
  const { peerInfo, remoteStreams, currentRoom, audioEnabled, videoEnabled } = useCallStore();
  const { user } = useAuthStore();

  const remotePeers = Array.from(remoteStreams.keys()).map((uid) => ({
    uid,
    ...(peerInfo.get(uid) || {}),
  }));

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/6">
        <h3 className="font-semibold text-white text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>
          Participants
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {1 + remotePeers.length} in call
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Local user */}
        <ParticipantRow
          uid="local"
          displayName={user?.displayName}
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          isLocal
          isHost={currentRoom?.hostUid === user?.uid}
        />

        {/* Remote peers */}
        {remotePeers.map((peer) => (
          <ParticipantRow
            key={peer.uid}
            uid={peer.uid}
            displayName={peer.displayName || 'Participant'}
            audioEnabled={peer.audioEnabled ?? true}
            videoEnabled={peer.videoEnabled ?? true}
            isHost={currentRoom?.hostUid === peer.uid}
          />
        ))}
      </div>
    </div>
  );
};

export default ParticipantsSidebar;
