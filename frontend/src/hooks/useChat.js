import { useEffect, useCallback, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { getSocket } from '../services/socket';
import { messagesApi } from '../services/api';

export const useChat = () => {
  const { addMessage, setMessages, setTyping } = useChatStore();
  const typingTimerRef = useRef(null);

  const loadHistory = useCallback(async (roomId) => {
    try {
      const { data } = await messagesApi.getRoomMessages(roomId);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load history:', err);
      setMessages([]);
    }
  }, [setMessages]);

  // FIX: sendMessage reads roomId at call time from param — never from stale closure
  const sendMessage = useCallback((roomId, message, fileData = null) => {
    if ((!message?.trim() && !fileData) || !roomId) {
      console.warn('[Chat] sendMessage called without roomId or message', { roomId, message });
      return;
    }
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

  // Register socket listeners once for app lifetime
  useEffect(() => {
    const socket = getSocket();

    const onMessage = (msg) => addMessage(msg);
    const onTyping = ({ uid, displayName, isTyping }) => {
      setTyping(uid, displayName, isTyping);
      if (isTyping) setTimeout(() => setTyping(uid, displayName, false), 4000);
    };

    socket.off('chat_message', onMessage);
    socket.off('user_typing', onTyping);
    socket.on('chat_message', onMessage);
    socket.on('user_typing', onTyping);

    return () => {
      socket.off('chat_message', onMessage);
      socket.off('user_typing', onTyping);
      clearTimeout(typingTimerRef.current);
    };
  }, [addMessage, setTyping]);

  return { sendMessage, sendTyping, loadHistory };
};
