import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { useChat } from '../../hooks/useChat';
import { useCallStore } from '../../store/callStore';
import { Avatar } from '../ui/Avatar';
import { formatMessageTime } from '../../utils/formatters';

export const ChatPanel = () => {
  const [input, setInput] = useState('');
  const { messages, isChatOpen, closeChat, typingUsers } = useChatStore();
  const { user } = useAuthStore();
  const { currentRoom } = useCallStore();
  const { sendMessage, sendTyping } = useChat();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isChatOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isChatOpen]);

  const handleSend = useCallback(() => {
    if (!input.trim() || !currentRoom) return;
    sendMessage(currentRoom.roomId, input.trim());
    setInput('');
    // Stop typing indicator
    clearTimeout(typingTimeoutRef.current);
    sendTyping(currentRoom.roomId, false);
  }, [input, currentRoom, sendMessage, sendTyping]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    // Typing indicator debounce
    if (!currentRoom) return;
    sendTyping(currentRoom.roomId, true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(currentRoom.roomId, false);
    }, 2000);
  };

  const typingList = Array.from(typingUsers.values()).filter((n) => n !== user?.displayName);

  // Group consecutive messages from same user
  const grouped = messages.map((msg, i) => ({
    ...msg,
    showAvatar: i === 0 || messages[i - 1]?.uid !== msg.uid,
    showName: i === 0 || messages[i - 1]?.uid !== msg.uid,
  }));

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-secondary)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="font-semibold text-white text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>
          Chat
        </h3>
        <button onClick={closeChat}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center
            text-slate-400 hover:text-white transition-all">
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-slate-600 text-sm pt-10 px-4">
            No messages yet. Start the conversation!
          </div>
        )}

        {grouped.map((msg) => {
          const isMe = msg.uid === user?.uid;
          return (
            <div key={msg.id}
              className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''} ${msg.showAvatar ? 'mt-3' : 'mt-0.5'}`}>

              {/* Avatar */}
              {!isMe && (
                msg.showAvatar
                  ? <Avatar name={msg.displayName} size="sm" className="flex-shrink-0 mt-1" />
                  : <div className="w-8 flex-shrink-0" />
              )}

              <div className={`flex flex-col max-w-[78%] ${isMe ? 'items-end' : 'items-start'}`}>
                {msg.showName && !isMe && (
                  <span className="text-xs text-slate-500 mb-1 ml-1">{msg.displayName}</span>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words
                  ${isMe
                    ? 'bg-amber-400/20 text-amber-50 rounded-tr-sm'
                    : 'bg-white/6 text-slate-200 rounded-tl-sm'}`}>
                  {msg.message && <p>{msg.message}</p>}
                </div>
                {msg.showAvatar && (
                  <span className="text-xs text-slate-600 mt-0.5 mx-1">
                    {formatMessageTime(msg.timestamp)}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingList.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2 ml-1">
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
            <span>{typingList.slice(0, 2).join(', ')} {typingList.length === 1 ? 'is' : 'are'} typing</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            rows={1}
            className="input-field resize-none flex-1 py-2.5 text-sm leading-5"
            style={{ minHeight: '42px', maxHeight: '100px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-30
              flex items-center justify-center transition-all duration-200 flex-shrink-0
              hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:hover:scale-100">
            <Send size={15} className="text-navy-950" />
          </button>
        </div>
      </div>
    </div>
  );
};
