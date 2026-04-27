import React from 'react';
import { useCallStore } from '../../store/callStore';
import { useAuthStore } from '../../store/authStore';
import { VideoTile } from './VideoTile';

const getGridClass = (count) => {
  if (count === 1) return 'video-grid-1';
  if (count === 2) return 'video-grid-2';
  if (count <= 4) return 'video-grid-3';
  if (count <= 6) return 'video-grid-4';
  return 'video-grid-many';
};

export const VideoGrid = () => {
  const { localStream, remoteStreams, peerInfo, audioEnabled, videoEnabled, isScreenSharing, activeSpeaker } = useCallStore();
  const { user } = useAuthStore();

  const peers = Array.from(remoteStreams.entries());
  const totalCount = 1 + peers.length;
  const gridClass = getGridClass(totalCount);

  return (
    <div className={`flex-1 grid gap-2 sm:gap-3 p-2 sm:p-3 ${gridClass} auto-rows-fr overflow-hidden`}
      style={{ minHeight: 0 }}>
      <VideoTile
        stream={localStream}
        displayName={user?.displayName || 'You'}
        isLocal
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        screenSharing={isScreenSharing}
        isActiveSpeaker={activeSpeaker === user?.uid}
      />
      {peers.map(([uid, stream]) => {
        const info = peerInfo.get(uid) || {};
        return (
          <VideoTile
            key={uid}
            stream={stream}
            displayName={info.displayName || 'Participant'}
            audioEnabled={info.audioEnabled !== false}
            videoEnabled={info.videoEnabled !== false}
            screenSharing={info.screenSharing || false}
            isActiveSpeaker={activeSpeaker === uid}
          />
        );
      })}
    </div>
  );
};
