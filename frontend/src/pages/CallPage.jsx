import React, { useState } from 'react';
import { Hash, Users, MessageSquare, ClipboardList, Menu, Home, Phone } from 'lucide-react';
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null); // null | 'online' | 'chat' | 'attendance'

  useOnlineUsers();
  useDirectCall();

  const closeMobilePanel = () => setMobilePanel(null);
  const toggleMobilePanel = (name) => setMobilePanel(p => p === name ? null : name);

  // Direct call fullscreen
  if (activeDirectCall) return <DirectCallView />;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>

      {/* ── Desktop Sidebar ─────────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col w-60 flex-shrink-0 h-full overflow-hidden">
        <Sidebar onRoomJoined={() => {}} />
      </div>

      {/* ── Mobile Sidebar Drawer ───────────────────────────────────────────── */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative w-72 flex-shrink-0 h-full overflow-auto animate-slide-in-right"
            style={{ background: 'var(--bg-secondary)' }}>
            <Sidebar onRoomJoined={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-16 md:pb-0">

        {/* TopBar row */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden ml-3 mt-1 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all flex-shrink-0"
            style={{ background: 'var(--bg-elevated)' }}>
            <Menu size={18} />
          </button>
          <div className="flex-1"><TopBar /></div>
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">

          {/* Video / empty */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {inCall ? (
              <>
                <VideoGrid />
                <ControlBar
                  onShowAttendance={() => { setShowAttendance(v => !v); setShowParticipants(false); }}
                  onShowParticipants={() => { setShowParticipants(v => !v); setShowAttendance(false); }}
                />
              </>
            ) : (
              <EmptyState />
            )}
          </div>

          {/* Desktop: online panel always right */}
          <div className="hidden md:flex flex-col w-60 flex-shrink-0 h-full"
            style={{ borderLeft: '1px solid var(--border)' }}>
            <OnlineUsersList />
          </div>

          {/* Desktop: chat panel */}
          {isChatOpen && inCall && (
            <div className="hidden sm:flex w-72 flex-shrink-0 flex-col"
              style={{ borderLeft: '1px solid var(--border)' }}>
              <ChatPanel />
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile Bottom Nav ───────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30"
        style={{
          background: 'rgba(11,18,32,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
        <div className="flex items-center justify-around px-2 py-1">
          {/* Rooms */}
          <MobileNavBtn icon={<Home size={20} />} label="Rooms"
            active={mobileSidebarOpen}
            onClick={() => { closeMobilePanel(); setMobileSidebarOpen(v => !v); }} />

          {/* Online */}
          <MobileNavBtn icon={<Users size={20} />} label="Online"
            active={mobilePanel === 'online'}
            onClick={() => { setMobileSidebarOpen(false); toggleMobilePanel('online'); }} />

          {/* Chat — only if in call */}
          {inCall && (
            <MobileNavBtn icon={<MessageSquare size={20} />} label="Chat"
              active={mobilePanel === 'chat'}
              onClick={() => { setMobileSidebarOpen(false); toggleMobilePanel('chat'); useChatStore.getState().toggleChat(); }} />
          )}

          {/* Attendance — only if in call */}
          {inCall && (
            <MobileNavBtn icon={<ClipboardList size={20} />} label="Attendance"
              active={mobilePanel === 'attendance'}
              onClick={() => { setMobileSidebarOpen(false); toggleMobilePanel('attendance'); }} />
          )}
        </div>
      </nav>

      {/* ── Overlay panels ─────────────────────────────────────────────────── */}
      {showAttendance && currentRoom && (
        <AttendancePanel roomId={currentRoom.roomId} onClose={() => setShowAttendance(false)} />
      )}
      {showParticipants && (
        <ParticipantsPanel onClose={() => setShowParticipants(false)} />
      )}

      {/* Mobile: Online bottom sheet */}
      {mobilePanel === 'online' && (
        <MobileSheet onClose={closeMobilePanel}>
          <OnlineUsersList onClose={closeMobilePanel} />
        </MobileSheet>
      )}

      {/* Mobile: Chat bottom sheet */}
      {isChatOpen && inCall && (
        <div className="sm:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => useChatStore.getState().closeChat()} />
          <div className="relative rounded-t-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', maxHeight: '80vh' }}>
            <ChatPanel />
          </div>
        </div>
      )}

      {/* Mobile: Attendance bottom sheet */}
      {mobilePanel === 'attendance' && currentRoom && (
        <MobileSheet onClose={closeMobilePanel}>
          <AttendancePanel roomId={currentRoom.roomId} onClose={closeMobilePanel} />
        </MobileSheet>
      )}

      {/* Global overlays */}
      <IncomingCallModal />
      <StatusPopup />
    </div>
  );
};

// ── Mobile nav button ─────────────────────────────────────────────────────────
const MobileNavBtn = ({ icon, label, active, onClick }) => (
  <button onClick={onClick}
    className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all duration-200 min-w-[60px] ${active ? '' : ''}`}
    style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
    <span className={`transition-transform duration-200 ${active ? 'scale-110' : ''}`}>{icon}</span>
    <span className="text-[10px] font-medium" style={{ fontFamily: 'Syne, sans-serif' }}>{label}</span>
  </button>
);

// ── Bottom sheet wrapper ──────────────────────────────────────────────────────
const MobileSheet = ({ children, onClose }) => (
  <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
    <div className="relative rounded-t-3xl overflow-hidden animate-slide-up"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', maxHeight: '75vh' }}>
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-strong)' }} />
      </div>
      {children}
    </div>
  </div>
);
