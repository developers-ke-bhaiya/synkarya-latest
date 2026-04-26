import { create } from 'zustand';

/**
 * Central call state store.
 * peerConnections: Map<uid, RTCPeerConnection>
 * remoteStreams:   Map<uid, MediaStream>
 * peerInfo:        Map<uid, { displayName, audioEnabled, videoEnabled, screenSharing }>
 */
export const useCallStore = create((set, get) => ({
  // Room state
  currentRoom: null,   // { roomId, name, code }
  inCall: false,

  // Local media
  localStream: null,
  screenStream: null,
  isScreenSharing: false,
  audioEnabled: true,
  videoEnabled: true,

  // Remote peers
  peerConnections: new Map(),  // uid → RTCPeerConnection
  remoteStreams: new Map(),     // uid → MediaStream
  peerInfo: new Map(),          // uid → { displayName, audioEnabled, videoEnabled }

  // UI state
  activeSpeaker: null,

  // ─── Room ───────────────────────────────────────────────────────────────────
  setCurrentRoom: (room) => set({ currentRoom: room }),

  setInCall: (inCall) => set({ inCall }),

  // ─── Local Stream ────────────────────────────────────────────────────────────
  setLocalStream: (stream) => set({ localStream: stream }),

  setScreenStream: (stream) => set({ screenStream: stream, isScreenSharing: !!stream }),

  setAudioEnabled: (enabled) => {
    const { localStream } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => { t.enabled = enabled; });
    }
    set({ audioEnabled: enabled });
  },

  setVideoEnabled: (enabled) => {
    const { localStream } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => { t.enabled = enabled; });
    }
    set({ videoEnabled: enabled });
  },

  // ─── Peer Connections ────────────────────────────────────────────────────────
  addPeerConnection: (uid, pc) => {
    set((state) => {
      const next = new Map(state.peerConnections);
      next.set(uid, pc);
      return { peerConnections: next };
    });
  },

  removePeerConnection: (uid) => {
    set((state) => {
      const next = new Map(state.peerConnections);
      const pc = next.get(uid);
      if (pc) {
        pc.close();
        next.delete(uid);
      }
      return { peerConnections: next };
    });
  },

  getPeerConnection: (uid) => get().peerConnections.get(uid),

  // ─── Remote Streams ──────────────────────────────────────────────────────────
  setRemoteStream: (uid, stream) => {
    set((state) => {
      const next = new Map(state.remoteStreams);
      next.set(uid, stream);
      return { remoteStreams: next };
    });
  },

  removeRemoteStream: (uid) => {
    set((state) => {
      const next = new Map(state.remoteStreams);
      next.delete(uid);
      return { remoteStreams: next };
    });
  },

  // ─── Peer Info ───────────────────────────────────────────────────────────────
  setPeerInfo: (uid, info) => {
    set((state) => {
      const next = new Map(state.peerInfo);
      const existing = next.get(uid) || {};
      next.set(uid, { ...existing, ...info });
      return { peerInfo: next };
    });
  },

  removePeerInfo: (uid) => {
    set((state) => {
      const next = new Map(state.peerInfo);
      next.delete(uid);
      return { peerInfo: next };
    });
  },

  setActiveSpeaker: (uid) => set({ activeSpeaker: uid }),

  // ─── Full Cleanup ────────────────────────────────────────────────────────────
  cleanupCall: () => {
    const { peerConnections, localStream, screenStream } = get();

    // Close all peer connections
    peerConnections.forEach((pc) => {
      try { pc.close(); } catch {}
    });

    // Stop local tracks
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
    }

    set({
      inCall: false,
      currentRoom: null,
      localStream: null,
      screenStream: null,
      isScreenSharing: false,
      audioEnabled: true,
      videoEnabled: true,
      peerConnections: new Map(),
      remoteStreams: new Map(),
      peerInfo: new Map(),
      activeSpeaker: null,
    });
  },
}));
