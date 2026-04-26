import React, { useState } from 'react';
import { Sidebar } from '../components/layout/Sidebar';
import { TopBar } from '../components/layout/TopBar';
import { VideoGrid } from '../components/call/VideoGrid';
import { ControlBar } from '../components/call/ControlBar';
import { ChatPanel } from '../components/chat/ChatPanel';
import { AttendancePanel } from '../components/attendance/AttendancePanel';
import { ParticipantsPanel } from '../components/call/ParticipantsPanel';
import { EmptyState } from '../components/layout/EmptyState';
import { useCallStore } from '../store/callStore';
import { useChatStore } from '../store/chatStore';

export const CallPage = () => {
  const { inCall, currentRoom } = useCallStore();
  const { isChatOpen } = useChatStore();
  const [showAttendance, setShowAttendance] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <Sidebar onRoomJoined={() => {}} />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />

        {/* Video + chat row */}
        <div className="flex-1 flex min-h-0">
          {/* Video area */}
          <div className="flex-1 flex flex-col min-w-0">
            {inCall ? <VideoGrid /> : <EmptyState />}
            {inCall && (
              <ControlBar
                onShowAttendance={() => {
                  setShowAttendance((v) => !v);
                  setShowParticipants(false);
                }}
                onShowParticipants={() => {
                  setShowParticipants((v) => !v);
                  setShowAttendance(false);
                }}
              />
            )}
          </div>

          {/* Chat panel */}
          {isChatOpen && inCall && <ChatPanel />}
        </div>
      </div>

      {/* Overlapping right panels */}
      {showAttendance && currentRoom && (
        <AttendancePanel
          roomId={currentRoom.roomId}
          onClose={() => setShowAttendance(false)}
        />
      )}
      {showParticipants && (
        <ParticipantsPanel onClose={() => setShowParticipants(false)} />
      )}
    </div>
  );
};
