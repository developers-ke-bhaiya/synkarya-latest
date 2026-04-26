import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Paperclip } from 'lucide-react';
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isChatOpen) inputRef.current?.focus();
  }, [isChatOpen]);

  const handleSend = () => {
    if (!input.trim() || !currentRoom) return;
    sendMessage(currentRoom.roomId, input);
    setInput('');
    sendTyping(currentRoom.roomId, false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      sendTyping(currentRoom?.roomId, true);
    }
  };

  const typingList = Array.from(typingUsers.values()).filter((n) => n !== user?.displayName);

  if (!isChatOpen) return null;

  return (
    <div className="flex flex-col w-80 flex-shrink-0 animate-slide-in-right"
      style={{ background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="font-semibold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
          Chat
        </h3>
        <button onClick={closeChat}
          className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center
            text-slate-400 hover:text-white transition-all">
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 0 }}>
        {messages.length === 0 && (
          <div className="text-center text-slate-600 text-sm mt-10">
            No messages yet. Say hello!
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.uid === user?.uid;
          const prevMsg = messages[i - 1];
          const showAvatar = !prevMsg || prevMsg.uid !== msg.uid;

          return (
            <div key={msg.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}>
              {!isMe && showAvatar && (
                <Avatar name={msg.displayName} size="sm" className="mt-1 flex-shrink-0" />
              )}
              {!isMe && !showAvatar && <div className="w-8" />}

              <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%]`}>
                {showAvatar && !isMe && (
                  <span className="text-xs text-slate-500 mb-1 ml-1">{msg.displayName}</span>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed
                  ${isMe
                    ? 'bg-amber-400/20 text-amber-50 rounded-tr-sm'
                    : 'bg-white/5 text-slate-200 rounded-tl-sm'
                  }`}>
                  {msg.message && <p>{msg.message}</p>}
                  {msg.fileUrl && (
                    <a href={msg.fileUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-amber-400 hover:underline mt-1">
                      <Paperclip size={12} />
                      <span className="text-xs">{msg.fileName || 'File'}</span>
                    </a>
                  )}
                </div>
                <span className="text-xs text-slate-600 mt-0.5 mx-1">
                  {formatMessageTime(msg.timestamp)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingList.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            {typingList.join(', ')} {typingList.length === 1 ? 'is' : 'are'} typing
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            rows={1}
            className="input-field resize-none flex-1 py-2.5 text-sm"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-30
              flex items-center justify-center transition-all duration-200 flex-shrink-0
              disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          >
            <Send size={16} className="text-navy-950" />
          </button>
        </div>
      </div>
    </div>
  );
};
