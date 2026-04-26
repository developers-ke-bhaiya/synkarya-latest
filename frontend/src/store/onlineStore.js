import { create } from 'zustand';

export const useOnlineStore = create((set, get) => ({
  onlineUsers: [],      // [{ uid, displayName, avatar }]
  incomingCall: null,   // { fromUid, fromName, fromAvatar, offer }
  activeDirectCall: null, // { peerUid, peerName, pc, stream }
  callStatus: null,     // 'calling' | 'ringing' | 'connected' | null

  setOnlineUsers: (users) => set({ onlineUsers: users }),

  addOnlineUser: (user) => set((s) => ({
    onlineUsers: s.onlineUsers.find(u => u.uid === user.uid)
      ? s.onlineUsers
      : [...s.onlineUsers, user]
  })),

  removeOnlineUser: (uid) => set((s) => ({
    onlineUsers: s.onlineUsers.filter(u => u.uid !== uid)
  })),

  setIncomingCall: (call) => set({ incomingCall: call }),
  clearIncomingCall: () => set({ incomingCall: null }),

  setActiveDirectCall: (call) => set({ activeDirectCall: call }),
  clearActiveDirectCall: () => set({ activeDirectCall: null, callStatus: null }),

  setCallStatus: (status) => set({ callStatus: status }),
}));
