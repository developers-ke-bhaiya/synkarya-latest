/**
 * WebRTC Service
 * Handles ICE configuration, peer connection factory, and stream utilities.
 */

export const ICE_SERVERS = {
  iceServers: [
    // Google STUN
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // OpenRelay TURN (UDP)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    // OpenRelay TURN (TCP)
    {
      urls: 'turn:openrelay.metered.ca:80?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    // OpenRelay TURN (443 fallback)
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

/**
 * Create a new RTCPeerConnection with proper config
 */
export const createPeerConnection = () => {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  return pc;
};

/**
 * Add all tracks from a stream to a peer connection
 */
export const addStreamToPeer = (pc, stream) => {
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });
};

/**
 * Replace a specific track kind on all senders
 */
export const replaceTrackOnPeer = async (pc, newTrack) => {
  const sender = pc.getSenders().find((s) => s.track?.kind === newTrack.kind);
  if (sender) {
    await sender.replaceTrack(newTrack);
  }
};

/**
 * Get user media with fallback constraints
 */
export const getUserMedia = async (constraints = { video: true, audio: true }) => {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.error('getUserMedia error:', err);
    throw err;
  }
};

/**
 * Get display media (screen share)
 */
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

/**
 * Stop all tracks in a stream
 */
export const stopStream = (stream) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop();
  });
};

/**
 * Create a silent audio track (for muted state)
 */
export const createSilentAudioTrack = () => {
  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const dst = oscillator.connect(ctx.createMediaStreamDestination());
  oscillator.start();
  const track = dst.stream.getAudioTracks()[0];
  return Object.assign(track, { enabled: false });
};

/**
 * Create a black video track (for camera off state)
 */
export const createBlackVideoTrack = (width = 640, height = 480) => {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  canvas.getContext('2d').fillRect(0, 0, width, height);
  const stream = canvas.captureStream();
  return stream.getVideoTracks()[0];
};
