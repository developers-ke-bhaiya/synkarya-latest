import React, { useEffect, useRef, useState } from 'react';
import { MicOff, VideoOff, Monitor } from 'lucide-react';
import { Avatar } from '../ui/Avatar';

export const VideoTile = ({ stream, displayName, isLocal = false, audioEnabled = true,
  videoEnabled = true, screenSharing = false, isActiveSpeaker = false }) => {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
    if (stream) {
      videoRef.current.srcObject = stream;
      // Check if video track is actually enabled and live
      const checkVideo = () => {
        const tracks = stream.getVideoTracks();
        setHasVideo(tracks.length > 0 && tracks.some((t) => t.enabled && t.readyState === 'live'));
      };
      checkVideo();
      // Re-check when tracks change
      stream.onaddtrack = checkVideo;
      stream.onremovetrack = checkVideo;
    } else {
      videoRef.current.srcObject = null;
      setHasVideo(false);
    }
  }, [stream]);

  // Also react to videoEnabled prop changes
  useEffect(() => {
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    setHasVideo(tracks.length > 0 && tracks.some((t) => t.enabled && t.readyState === 'live') && videoEnabled);
  }, [videoEnabled, stream]);

  const showVideo = hasVideo && videoEnabled;

  return (
    <div className={`video-tile w-full h-full relative ${isActiveSpeaker ? 'speaking-ring' : ''}`}>
      {/* Always render video element — just hide when not needed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover transition-opacity duration-200 ${showVideo ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
        style={{ transform: isLocal && !screenSharing ? 'scaleX(-1)' : 'none' }}
      />

      {/* Avatar fallback when no video */}
      {!showVideo && (
        <div className="w-full h-full flex items-center justify-center absolute inset-0"
          style={{ background: 'var(--bg-elevated)' }}>
          <Avatar name={displayName} size="xl" />
        </div>
      )}

      {/* Bottom gradient */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent rounded-b-2xl pointer-events-none" />

      {/* Name */}
      <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 flex items-center gap-1.5">
        {screenSharing && (
          <span className="flex items-center gap-1 text-xs bg-amber-400/20 text-amber-400
            px-1.5 py-0.5 rounded-full border border-amber-400/30">
            <Monitor size={9} /> Screen
          </span>
        )}
        <span className="text-xs sm:text-sm font-medium text-white drop-shadow-md truncate max-w-[140px]">
          {displayName}{isLocal ? ' (You)' : ''}
        </span>
      </div>

      {/* Status icons */}
      <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex items-center gap-1 pointer-events-none">
        {!audioEnabled && (
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-red-500/90 flex items-center justify-center">
            <MicOff size={11} className="text-white" />
          </div>
        )}
        {!videoEnabled && (
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-700/90 flex items-center justify-center">
            <VideoOff size={11} className="text-white" />
          </div>
        )}
      </div>

      {/* Speaking dot */}
      {isActiveSpeaker && (
        <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse pointer-events-none" />
      )}
    </div>
  );
};
