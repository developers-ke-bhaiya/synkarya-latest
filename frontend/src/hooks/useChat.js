import { useEffect, useCallback, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { getSocket } from '../services/socket';
import { messagesApi } from '../services/api';

export const useChat = (roomId) => {
  const { addMessage, setMessages, setTyping, clearChat } = useChatStore();
  const typingTimerRef = useRef(null);
  // Track if we've already registered listeners for this roomId
  const registeredRef = useRef(false);

  const loadHistory = useCallback(async (rid) => {
    try {
      const { data } = await messagesApi.getRoomMessages(rid);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load message history:', err);
    }
  }, [setMessages]);

  const sendMessage = useCallback((rid, message, fileData = null) => {
    if (!message?.trim() && !fileData) return;
    const socket = getSocket();
    socket.emit('chat_message', {
      roomId: rid,
      message: message?.trim() || '',
      fileUrl: fileData?.url || null,
      fileType: fileData?.type || null,
      fileName: fileData?.name || null,
    });
  }, []);

  const sendTyping = useCallback((rid, isTyping) => {
    const socket = getSocket();
    socket.emit('typing', { roomId: rid, isTyping });
    if (isTyping) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        socket.emit('typing', { roomId: rid, isTyping: false });
      }, 3000);
    }
  }, []);

  // Register socket listeners ONCE — critical fix for duplicate messages
  useEffect(() => {
    const socket = getSocket();

    // Remove any existing listeners before adding new ones
    socket.off('chat_message');
    socket.off('user_typing');

    const onMessage = (msg) => {
      addMessage(msg);
    };

    const onTyping = ({ uid, displayName, isTyping }) => {
      setTyping(uid, displayName, isTyping);
      if (isTyping) {
        setTimeout(() => setTyping(uid, displayName, false), 4000);
      }
    };

    socket.on('chat_message', onMessage);
    socket.on('user_typing', onTyping);

    return () => {
      socket.off('chat_message', onMessage);
      socket.off('user_typing', onTyping);
      clearTimeout(typingTimerRef.current);
    };
  }, []); // Empty deps — register once for lifetime of app

  return { sendMessage, sendTyping, loadHistory, clearChat };
};
