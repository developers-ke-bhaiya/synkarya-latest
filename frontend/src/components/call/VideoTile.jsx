import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MicOff, VideoOff, Monitor } from 'lucide-react';
import { Avatar } from '../ui/Avatar';

export const VideoTile = ({
  stream, displayName, isLocal = false,
  audioEnabled = true, videoEnabled = true,
  screenSharing = false, isActiveSpeaker = false,
}) => {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  const checkVideo = useCallback((s) => {
    if (!s) { setHasVideo(false); return; }
    const tracks = s.getVideoTracks();
    setHasVideo(tracks.length > 0 && tracks.some(t => t.readyState === 'live' && t.enabled));
  }, []);

  // FIX: always sync srcObject on stream change, PLUS listen for track changes
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (stream) {
      // Only update srcObject if it actually changed
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
      checkVideo(stream);

      const onTrackChange = () => checkVideo(stream);
      stream.addEventListener('addtrack', onTrackChange);
      stream.addEventListener('removetrack', onTrackChange);
      return () => {
        stream.removeEventListener('addtrack', onTrackChange);
        stream.removeEventListener('removetrack', onTrackChange);
      };
    } else {
      el.srcObject = null;
      setHasVideo(false);
    }
  }, [stream, checkVideo]);

  // Also react to videoEnabled prop so avatar shows correctly when muted
  useEffect(() => {
    if (stream) checkVideo(stream);
  }, [videoEnabled, stream, checkVideo]);

  const showVideo = hasVideo && videoEnabled;

  return (
    <div
      className={`video-tile w-full h-full relative overflow-hidden ${isActiveSpeaker ? 'speaking-ring' : ''}`}
      style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}
    >
      {/* Video element — always mounted, just hidden when no video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover transition-opacity duration-300 ${showVideo ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'}`}
        style={{ transform: isLocal && !screenSharing ? 'scaleX(-1)' : 'none' }}
      />

      {/* Avatar fallback */}
      {!showVideo && (
        <div className="w-full h-full flex items-center justify-center absolute inset-0">
          <div className="flex flex-col items-center gap-2">
            <Avatar name={displayName} size="xl" />
            {/* Subtle bouncing dots for remote when connecting */}
            {!isLocal && !stream && (
              <div className="flex items-center gap-1 mt-1">
                {[0, 150, 300].map(d => (
                  <div key={d} className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-bounce"
                    style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom gradient + name */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/75 to-transparent pointer-events-none rounded-b-2xl" />
      <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 pointer-events-none">
        {screenSharing && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-amber-400/25 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-400/30">
            <Monitor size={9} /> Screen
          </span>
        )}
        <span className="text-xs font-medium text-white/90 drop-shadow truncate max-w-[150px]">
          {displayName}{isLocal ? ' (You)' : ''}
        </span>
      </div>

      {/* Status icons top-right */}
      <div className="absolute top-2 right-2 flex items-center gap-1 pointer-events-none">
        {!audioEnabled && (
          <div className="w-6 h-6 rounded-lg bg-red-500/90 backdrop-blur-sm flex items-center justify-center shadow-md">
            <MicOff size={11} className="text-white" />
          </div>
        )}
        {!videoEnabled && (
          <div className="w-6 h-6 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-md">
            <VideoOff size={11} className="text-white" />
          </div>
        )}
      </div>

      {/* Speaking indicator */}
      {isActiveSpeaker && (
        <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse pointer-events-none shadow-glow-amber" />
      )}
    </div>
  );
};
