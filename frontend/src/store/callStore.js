import { create } from 'zustand';

export const useCallStore = create((set, get) => ({
  currentRoom: null,
  inCall: false,
  localStream: null,
  screenStream: null,
  isScreenSharing: false,
  audioEnabled: true,
  videoEnabled: true,
  peerConnections: new Map(),
  remoteStreams: new Map(),
  peerInfo: new Map(),
  activeSpeaker: null,

  setCurrentRoom: (room) => set({ currentRoom: room }),
  setInCall: (inCall) => set({ inCall }),

  // Always create new MediaStream reference so React sees the change
  setLocalStream: (stream) => set({ localStream: stream }),

  setScreenStream: (stream) => set({ screenStream: stream, isScreenSharing: !!stream }),

  setAudioEnabled: (enabled) => {
    const { localStream } = get();
    if (localStream) localStream.getAudioTracks().forEach((t) => { t.enabled = enabled; });
    set({ audioEnabled: enabled });
  },

  setVideoEnabled: (enabled) => {
    const { localStream } = get();
    if (localStream) localStream.getVideoTracks().forEach((t) => { t.enabled = enabled; });
    set({ videoEnabled: enabled });
  },

  addPeerConnection: (uid, pc) => set((s) => {
    const next = new Map(s.peerConnections);
    next.set(uid, pc);
    return { peerConnections: next };
  }),

  removePeerConnection: (uid) => set((s) => {
    const next = new Map(s.peerConnections);
    const pc = next.get(uid);
    if (pc) { try { pc.close(); } catch {} next.delete(uid); }
    return { peerConnections: next };
  }),

  getPeerConnection: (uid) => get().peerConnections.get(uid),

  setRemoteStream: (uid, stream) => set((s) => {
    const next = new Map(s.remoteStreams);
    next.set(uid, stream);
    return { remoteStreams: next };
  }),

  removeRemoteStream: (uid) => set((s) => {
    const next = new Map(s.remoteStreams);
    next.delete(uid);
    return { remoteStreams: next };
  }),

  setPeerInfo: (uid, info) => set((s) => {
    const next = new Map(s.peerInfo);
    const existing = next.get(uid) || {};
    next.set(uid, { ...existing, ...info });
    return { peerInfo: next };
  }),

  removePeerInfo: (uid) => set((s) => {
    const next = new Map(s.peerInfo);
    next.delete(uid);
    return { peerInfo: next };
  }),

  setActiveSpeaker: (uid) => set({ activeSpeaker: uid }),

  cleanupCall: () => {
    const { peerConnections, localStream, screenStream } = get();
    peerConnections.forEach((pc) => { try { pc.close(); } catch {} });
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
    set({
      inCall: false, currentRoom: null,
      localStream: null, screenStream: null,
      isScreenSharing: false, audioEnabled: true, videoEnabled: true,
      peerConnections: new Map(), remoteStreams: new Map(),
      peerInfo: new Map(), activeSpeaker: null,
    });
  },
}));
