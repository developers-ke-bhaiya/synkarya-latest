import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;

export const getSocket = () => {
  // FIX: return existing socket if it exists and is NOT closed
  // Previously: `socket.connected` check caused new socket creation on temporary disconnect,
  // leaving old listeners orphaned and new socket missing room/call state.
  if (socket && socket.io && socket.io.readyState !== 'closed') return socket;

  const token = localStorage.getItem('synkarya_token');

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Socket connect error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
    // io client handles reconnection automatically
    if (reason === 'io server disconnect') {
      // Server-initiated disconnect — re-connect manually
      socket.connect();
    }
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
};

export default { getSocket, disconnectSocket };
