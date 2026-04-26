import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  messages: [],
  isChatOpen: false,
  unreadCount: 0,
  typingUsers: new Map(), // uid → displayName

  addMessage: (msg) => {
    set((state) => ({
      messages: [...state.messages, msg],
      unreadCount: state.isChatOpen ? 0 : state.unreadCount + 1,
    }));
  },

  setMessages: (messages) => set({ messages, unreadCount: 0 }),

  toggleChat: () => {
    set((state) => ({
      isChatOpen: !state.isChatOpen,
      unreadCount: !state.isChatOpen ? 0 : state.unreadCount,
    }));
  },

  openChat: () => set({ isChatOpen: true, unreadCount: 0 }),
  closeChat: () => set({ isChatOpen: false }),

  setTyping: (uid, displayName, isTyping) => {
    set((state) => {
      const next = new Map(state.typingUsers);
      if (isTyping) {
        next.set(uid, displayName);
      } else {
        next.delete(uid);
      }
      return { typingUsers: next };
    });
  },

  clearChat: () => set({ messages: [], unreadCount: 0, typingUsers: new Map() }),
}));
