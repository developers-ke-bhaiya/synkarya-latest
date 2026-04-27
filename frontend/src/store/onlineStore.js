import { create } from 'zustand';

export const useOnlineStore = create((set, get) => ({
  onlineUsers: [],
  incomingCall: null,      // { fromUid, fromDisplayName, fromAvatar }
  activeDirectCall: null,  // { peerUid, peerName, peerAvatar, localStream, remoteStream, pc }
  directCallStatus: null,  // 'calling'|'ringing'|'connected'|null
  directAudioEnabled: true,
  directVideoEnabled: true,
  directScreenSharing: false,
  peerMediaState: {},      // uid → { audioEnabled, videoEnabled, screenSharing }

  setOnlineUsers: (users) => set({ onlineUsers: users }),

  setIncomingCall: (call) => set({ incomingCall: call }),
  clearIncomingCall: () => set({ incomingCall: null }),

  setActiveDirectCall: (call) => set({ activeDirectCall: call }),

  clearActiveDirectCall: () => {
    const { activeDirectCall } = get();
    if (activeDirectCall?.pc) {
      try { activeDirectCall.pc.close(); } catch {}
    }
    if (activeDirectCall?.localStream) {
      activeDirectCall.localStream.getTracks().forEach((t) => t.stop());
    }
    set({ activeDirectCall: null, directCallStatus: null, peerMediaState: {} });
  },

  setDirectCallStatus: (status) => set({ directCallStatus: status }),

  setDirectAudioEnabled: (v) => set({ directAudioEnabled: v }),
  setDirectVideoEnabled: (v) => set({ directVideoEnabled: v }),
  setDirectScreenSharing: (v) => set({ directScreenSharing: v }),

  setPeerMediaState: (uid, state) => set((s) => ({
    peerMediaState: { ...s.peerMediaState, [uid]: state },
  })),
}));
