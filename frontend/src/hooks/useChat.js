import { useEffect, useCallback, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { getSocket } from '../services/socket';
import { messagesApi } from '../services/api';

export const useChat = () => {
  const { addMessage, setMessages, setTyping } = useChatStore();
  const typingTimerRef = useRef(null);

  const loadHistory = useCallback(async (roomId) => {
    if (!roomId) return;
    try {
      const { data } = await messagesApi.getRoomMessages(roomId);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('loadHistory error:', err);
      setMessages([]);
    }
  }, [setMessages]);

  const sendMessage = useCallback((roomId, message, fileData = null) => {
    if (!roomId) { console.error('[Chat] sendMessage: no roomId'); return; }
    if (!message?.trim() && !fileData) return;
    const socket = getSocket();
    socket.emit('chat_message', {
      roomId,
      message: message?.trim() || '',
      fileUrl: fileData?.url || null,
      fileType: fileData?.type || null,
      fileName: fileData?.name || null,
    });
  }, []);

  const sendTyping = useCallback((roomId, isTyping) => {
    if (!roomId) return;
    const socket = getSocket();
    socket.emit('typing', { roomId, isTyping });
    if (isTyping) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        socket.emit('typing', { roomId, isTyping: false });
      }, 3000);
    }
  }, []);

  // Register socket listeners ONCE — mount only
  useEffect(() => {
    const socket = getSocket();
    const onMessage = (msg) => addMessage(msg);
    const onTyping = ({ uid, displayName, isTyping }) => {
      setTyping(uid, displayName, isTyping);
      if (isTyping) setTimeout(() => setTyping(uid, displayName, false), 4000);
    };

    // Remove before adding — prevents duplicate on StrictMode double-mount
    socket.off('chat_message', onMessage);
    socket.off('user_typing', onTyping);
    socket.on('chat_message', onMessage);
    socket.on('user_typing', onTyping);

    return () => {
      socket.off('chat_message', onMessage);
      socket.off('user_typing', onTyping);
      clearTimeout(typingTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // MOUNT ONCE

  return { sendMessage, sendTyping, loadHistory };
};
