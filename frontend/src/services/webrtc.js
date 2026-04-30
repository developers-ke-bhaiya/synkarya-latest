/**
 * WebRTC Service
 * Handles ICE configuration, peer connection factory, and stream utilities.
 */

export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:80?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

export const createPeerConnection = () => {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  return pc;
};

export const addStreamToPeer = (pc, stream) => {
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });
};

export const replaceTrackOnPeer = async (pc, newTrack) => {
  const sender = pc.getSenders().find((s) => s.track?.kind === newTrack.kind);
  if (sender) {
    await sender.replaceTrack(newTrack);
  } else {
    // FIX: if no sender of this kind exists yet, add it (e.g. audio-only -> video added)
    console.warn(`replaceTrackOnPeer: no sender for kind=${newTrack.kind}, adding new track`);
    pc.addTrack(newTrack);
  }
};

/**
 * FIX: getUserMedia with progressive constraint fallback
 * Tries video+audio → audio-only → throws
 */
export const getUserMedia = async (constraints = { video: true, audio: true }) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (err) {
    // If camera is specifically requested and fails, try without it
    if (constraints.video && constraints.audio) {
      console.warn('getUserMedia video+audio failed:', err.name, '— trying audio only');
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        return audioStream;
      } catch (audioErr) {
        console.error('getUserMedia audio-only also failed:', audioErr);
        throw audioErr;
      }
    }
    console.error('getUserMedia error:', err);
    throw err;
  }
};

export const getDisplayMedia = async () => {
  return await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'monitor',
      logicalSurface: true,
      cursor: 'always',
    },
    audio: true,
  });
};

export const stopStream = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop();
  });
};

export const createSilentAudioTrack = () => {
  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const dst = oscillator.connect(ctx.createMediaStreamDestination());
  oscillator.start();
  const track = dst.stream.getAudioTracks()[0];
  return Object.assign(track, { enabled: false });
};

export const createBlackVideoTrack = (width = 640, height = 480) => {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  canvas.getContext('2d').fillRect(0, 0, width, height);
  const stream = canvas.captureStream();
  return stream.getVideoTracks()[0];
};
