import { create } from 'zustand';

export const useOnlineStore = create((set, get) => ({
  onlineUsers: [],
  incomingCall: null,
  activeDirectCall: null,
  directCallStatus: null,
  directAudioEnabled: true,
  directVideoEnabled: true,
  directScreenSharing: false,
  peerMediaState: {},
  // Direct call chat messages
  directMessages: [],

  setOnlineUsers: (users) => set({ onlineUsers: users }),
  setIncomingCall: (call) => set({ incomingCall: call }),
  clearIncomingCall: () => set({ incomingCall: null }),

  setActiveDirectCall: (call) => set((s) => ({
    activeDirectCall: typeof call === 'function' ? call(s.activeDirectCall) : call,
  })),

  clearActiveDirectCall: () => {
    const { activeDirectCall } = get();
    if (activeDirectCall?.pc) { try { activeDirectCall.pc.close(); } catch {} }
    if (activeDirectCall?.localStream) {
      activeDirectCall.localStream.getTracks().forEach((t) => t.stop());
    }
    set({
      activeDirectCall: null, directCallStatus: null,
      peerMediaState: {}, directMessages: [],
      directAudioEnabled: true, directVideoEnabled: true, directScreenSharing: false,
    });
  },

  setDirectCallStatus: (status) => set({ directCallStatus: status }),
  setDirectAudioEnabled: (v) => set({ directAudioEnabled: v }),
  setDirectVideoEnabled: (v) => set({ directVideoEnabled: v }),
  setDirectScreenSharing: (v) => set({ directScreenSharing: v }),

  setPeerMediaState: (uid, state) => set((s) => ({
    peerMediaState: { ...s.peerMediaState, [uid]: state },
  })),

  addDirectMessage: (msg) => set((s) => ({
    directMessages: [...s.directMessages, msg],
  })),
}));
