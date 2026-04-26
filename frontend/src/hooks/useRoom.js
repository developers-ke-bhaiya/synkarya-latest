import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCallStore } from '../store/callStore';
import { useChatStore } from '../store/chatStore';
import { getSocket } from '../services/socket';
import { useWebRTC } from './useWebRTC';

export const useRoom = () => {
  const navigate = useNavigate();
  const { setCurrentRoom, setInCall, cleanupCall } = useCallStore();
  const { clearChat } = useChatStore();
  const { initLocalStream, endCall } = useWebRTC();
  const socket = getSocket();

  const joinRoom = useCallback(
    async (room) => {
      try {
        // 1. Get local media first
        await initLocalStream();

        // 2. Set room state
        setCurrentRoom(room);
        setInCall(true);

        // 3. Join via socket
        socket.emit('join_room', {
          roomId: room.roomId,
          roomName: room.name,
        });

        // 4. Navigate to call page
        navigate(`/call/${room.roomId}`);
      } catch (err) {
        console.error('joinRoom error:', err);
        cleanupCall();
        throw err;
      }
    },
    [socket, initLocalStream, setCurrentRoom, setInCall, cleanupCall, navigate]
  );

  const leaveRoom = useCallback(() => {
    endCall();
    clearChat();
    navigate('/dashboard');
  }, [endCall, clearChat, navigate]);

  return { joinRoom, leaveRoom };
};
