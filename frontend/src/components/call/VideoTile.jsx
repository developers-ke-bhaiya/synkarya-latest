import React, { useEffect, useRef } from 'react';
import { MicOff, VideoOff, Monitor } from 'lucide-react';
import { Avatar } from '../ui/Avatar';

export const VideoTile = ({
  stream,
  displayName,
  isLocal = false,
  audioEnabled = true,
  videoEnabled = true,
  screenSharing = false,
  isActiveSpeaker = false,
  size = 'normal',
}) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().length > 0 && videoEnabled;

  return (
    <div className={`video-tile w-full h-full relative
      ${isActiveSpeaker ? 'speaking-ring' : ''}
      ${size === 'large' ? 'rounded-3xl' : 'rounded-2xl'}
    `}>
      {/* Video element */}
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
          style={{ transform: isLocal && !screenSharing ? 'scaleX(-1)' : 'none' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center"
          style={{ background: 'var(--bg-elevated)' }}>
          <Avatar name={displayName} size="xl" />
        </div>
      )}

      {/* Gradient overlay at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent rounded-b-2xl" />

      {/* Name tag */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        {screenSharing && (
          <span className="flex items-center gap-1 text-xs bg-amber-400/20 text-amber-400
            px-2 py-0.5 rounded-full border border-amber-400/30">
            <Monitor size={10} /> Screen
          </span>
        )}
        <span className="text-sm font-medium text-white drop-shadow-md">
          {displayName}{isLocal ? ' (You)' : ''}
        </span>
      </div>

      {/* Status icons */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {!audioEnabled && (
          <div className="w-7 h-7 rounded-lg bg-red-500/90 flex items-center justify-center">
            <MicOff size={12} className="text-white" />
          </div>
        )}
        {!videoEnabled && (
          <div className="w-7 h-7 rounded-lg bg-slate-700/90 flex items-center justify-center">
            <VideoOff size={12} className="text-white" />
          </div>
        )}
      </div>

      {/* Speaking indicator dot */}
      {isActiveSpeaker && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        </div>
      )}
    </div>
  );
};
