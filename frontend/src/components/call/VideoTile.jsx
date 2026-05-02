import React, { useEffect, useRef, useState } from 'react';
import { MicOff, VideoOff, Monitor } from 'lucide-react';
import { Avatar } from '../ui/Avatar';

export const VideoTile = ({
  stream, displayName, isLocal = false,
  audioEnabled = true, videoEnabled = true,
  screenSharing = false, isActiveSpeaker = false,
}) => {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!stream) {
      el.srcObject = null;
      setHasVideo(false);
      return;
    }

    // Always assign — even if same object, this is safe
    el.srcObject = stream;
    el.play().catch(() => {});

    const updateHasVideo = () => {
      const tracks = stream.getVideoTracks();
      setHasVideo(tracks.length > 0 && tracks.some(t => t.readyState === 'live'));
    };

    updateHasVideo();
    stream.addEventListener('addtrack', updateHasVideo);
    stream.addEventListener('removetrack', updateHasVideo);

    // Poll every 500ms for readyState changes (handles mute/unmute)
    const poll = setInterval(updateHasVideo, 500);

    return () => {
      stream.removeEventListener('addtrack', updateHasVideo);
      stream.removeEventListener('removetrack', updateHasVideo);
      clearInterval(poll);
    };
  }, [stream]);

  useEffect(() => {
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    setHasVideo(tracks.length > 0 && tracks.some(t => t.readyState === 'live'));
  }, [videoEnabled]);

  const showVideo = hasVideo && videoEnabled;

  return (
    <div
      className={`video-tile w-full h-full relative overflow-hidden ${isActiveSpeaker ? 'speaking-ring' : ''}`}
      style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-cover"
        style={{
          transform: isLocal && !screenSharing ? 'scaleX(-1)' : 'none',
          opacity: showVideo ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Avatar name={displayName} size="xl" />
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

      {isActiveSpeaker && (
        <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse pointer-events-none" />
      )}
    </div>
  );
};
