import { useEffect, useCallback, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { getSocket } from '../services/socket';
import { messagesApi } from '../services/api';

export const useChat = () => {
  const { addMessage, setMessages, setTyping, clearChat } = useChatStore();
  const typingTimerRef = useRef(null);
  const socket = getSocket();

  const loadHistory = useCallback(async (roomId) => {
    try {
      const { data } = await messagesApi.getRoomMessages(roomId);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load message history:', err);
    }
  }, [setMessages]);

  const sendMessage = useCallback((roomId, message, fileData = null) => {
    if (!message?.trim() && !fileData) return;
    const s = getSocket();
    s.emit('chat_message', {
      roomId,
      message: message?.trim() || '',
      fileUrl: fileData?.url || null,
      fileType: fileData?.type || null,
      fileName: fileData?.name || null,
    });
  }, []);

  const sendTyping = useCallback((roomId, isTyping) => {
    const s = getSocket();
    s.emit('typing', { roomId, isTyping });
    if (isTyping) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        s.emit('typing', { roomId, isTyping: false });
      }, 3000);
    }
  }, []);

  useEffect(() => {
    const onMessage = (msg) => addMessage(msg);
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
  }, [socket, addMessage, setTyping]);

  return { sendMessage, sendTyping, loadHistory, clearChat };
};
