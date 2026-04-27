import React, { useState, useEffect } from 'react';
import { Hash, Users, MessageSquare, ClipboardList, Menu, X, Home } from 'lucide-react';
import { Sidebar } from '../components/layout/Sidebar';
import { TopBar } from '../components/layout/TopBar';
import { VideoGrid } from '../components/call/VideoGrid';
import { ControlBar } from '../components/call/ControlBar';
import { ChatPanel } from '../components/chat/ChatPanel';
import { AttendancePanel } from '../components/attendance/AttendancePanel';
import { ParticipantsPanel } from '../components/call/ParticipantsPanel';
import { EmptyState } from '../components/layout/EmptyState';
import { OnlineUsersList } from '../components/layout/OnlineUsersList';
import { IncomingCallModal } from '../components/call/IncomingCallModal';
import { DirectCallView } from '../components/call/DirectCallView';
import { StatusPopup } from '../components/layout/StatusPopup';
import { useCallStore } from '../store/callStore';
import { useChatStore } from '../store/chatStore';
import { useOnlineStore } from '../store/onlineStore';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import { useDirectCall } from '../hooks/useDirectCall';

export const CallPage = () => {
  const { inCall, currentRoom } = useCallStore();
  const { isChatOpen } = useChatStore();
  const { activeDirectCall, incomingCall } = useOnlineStore();
  const [showAttendance, setShowAttendance] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showOnline, setShowOnline] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState('rooms'); // 'rooms'|'online'|'chat'

  // Init hooks
  useOnlineUsers();
  useDirectCall();

  // Close panels when switching
  const closeAllPanels = () => {
    setShowAttendance(false);
    setShowParticipants(false);
    setShowOnline(false);
  };

  // If in a direct call, show that fullscreen
  if (activeDirectCall) return <DirectCallView />;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>

      {/* ── DESKTOP SIDEBAR ──────────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col w-60 flex-shrink-0 h-full overflow-hidden"
        style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
        <Sidebar onRoomJoined={() => {}} />
      </div>

      {/* ── MOBILE SIDEBAR OVERLAY ───────────────────────────────────────────── */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative w-72 flex-shrink-0 h-full overflow-auto"
            style={{ background: 'var(--bg-secondary)' }}>
            <Sidebar onRoomJoined={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* ── MAIN AREA ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-2">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden ml-3 mt-1 w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center
              text-slate-400 hover:text-white flex-shrink-0">
            <Menu size={18} />
          </button>
          <div className="flex-1"><TopBar /></div>
        </div>

        {/* Content row */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Video / empty */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {inCall ? (
              <>
                <VideoGrid />
                <ControlBar
                  onShowAttendance={() => { closeAllPanels(); setShowAttendance((v) => !v); }}
                  onShowParticipants={() => { closeAllPanels(); setShowParticipants((v) => !v); }}
                />
              </>
            ) : (
              <EmptyState />
            )}
          </div>

          {/* Desktop right panels */}
          <div className="hidden md:flex flex-col">
            {/* Online users always visible on desktop */}
            <div className="w-60 flex-shrink-0 h-full overflow-hidden flex flex-col"
              style={{ borderLeft: '1px solid var(--border)' }}>
              <OnlineUsersList />
            </div>
          </div>

          {/* Chat panel */}
          {isChatOpen && inCall && (
            <div className="hidden sm:flex w-72 flex-shrink-0 flex-col"
              style={{ borderLeft: '1px solid var(--border)' }}>
              <ChatPanel />
            </div>
          )}
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV ────────────────────────────────────────────────── */}
      <nav className="mobile-nav md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button className={`mobile-nav-btn ${mobileTab === 'rooms' ? 'active' : ''}`}
          onClick={() => { setMobileTab('rooms'); setMobileSidebarOpen(true); }}>
          <Home size={20} />
          <span className="text-xs">Rooms</span>
        </button>
        <button className={`mobile-nav-btn ${mobileTab === 'online' ? 'active' : ''}`}
          onClick={() => { setMobileTab('online'); setShowOnline(true); }}>
          <Users size={20} />
          <span className="text-xs">Online</span>
        </button>
        {inCall && (
          <button className={`mobile-nav-btn ${mobileTab === 'chat' ? 'active' : ''}`}
            onClick={() => { setMobileTab('chat'); useChatStore.getState().toggleChat(); }}>
            <MessageSquare size={20} />
            <span className="text-xs">Chat</span>
          </button>
        )}
        {inCall && (
          <button className={`mobile-nav-btn ${mobileTab === 'attendance' ? 'active' : ''}`}
            onClick={() => { setMobileTab('attendance'); setShowAttendance(true); }}>
            <ClipboardList size={20} />
            <span className="text-xs">Attendance</span>
          </button>
        )}
      </nav>

      {/* ── OVERLAPPING PANELS ───────────────────────────────────────────────── */}
      {showAttendance && currentRoom && (
        <AttendancePanel roomId={currentRoom.roomId} onClose={() => setShowAttendance(false)} />
      )}
      {showParticipants && (
        <ParticipantsPanel onClose={() => setShowParticipants(false)} />
      )}

      {/* Mobile online users sheet */}
      {showOnline && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowOnline(false)} />
          <div className="relative rounded-t-2xl overflow-hidden"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', maxHeight: '70vh' }}>
            <OnlineUsersList onClose={() => setShowOnline(false)} />
          </div>
        </div>
      )}

      {/* Mobile chat bottom sheet */}
      {isChatOpen && inCall && (
        <div className="sm:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => useChatStore.getState().closeChat()} />
          <div className="relative rounded-t-2xl overflow-hidden"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <ChatPanel />
          </div>
        </div>
      )}

      {/* ── GLOBAL OVERLAYS ──────────────────────────────────────────────────── */}
      <IncomingCallModal />
      <StatusPopup />
    </div>
  );
};
