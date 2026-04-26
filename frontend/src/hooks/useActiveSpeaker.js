import { useEffect, useRef } from 'react';
import { useCallStore } from '../store/callStore';

/**
 * Polls audio levels on all streams to detect the active speaker.
 * Uses Web Audio API AnalyserNode for real-time volume measurement.
 */
export const useActiveSpeaker = () => {
  const { localStream, remoteStreams, setActiveSpeaker } = useCallStore();
  const analyserRefs = useRef(new Map()); // uid → { analyser, dataArray }
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const localUidRef = useRef('local');

  useEffect(() => {
    if (!localStream && remoteStreams.size === 0) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;

    const setupAnalyser = (uid, stream) => {
      if (analyserRefs.current.has(uid)) return;
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) return;

      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyserRefs.current.set(uid, { analyser, dataArray, source });
      } catch {}
    };

    if (localStream) setupAnalyser('local', localStream);
    remoteStreams.forEach((stream, uid) => setupAnalyser(uid, stream));

    const tick = () => {
      let maxVolume = 0;
      let maxUid = null;

      analyserRefs.current.forEach(({ analyser, dataArray }, uid) => {
        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        if (volume > maxVolume && volume > 8) {
          maxVolume = volume;
          maxUid = uid;
        }
      });

      setActiveSpeaker(maxUid);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [localStream, remoteStreams, setActiveSpeaker]);

  // Cleanup analyser nodes when streams are removed
  useEffect(() => {
    const activeUids = new Set(['local', ...remoteStreams.keys()]);
    analyserRefs.current.forEach((_, uid) => {
      if (!activeUids.has(uid)) {
        const { source } = analyserRefs.current.get(uid);
        try { source.disconnect(); } catch {}
        analyserRefs.current.delete(uid);
      }
    });
  }, [remoteStreams]);
};
