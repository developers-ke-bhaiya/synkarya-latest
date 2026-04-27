import { useEffect, useCallback } from 'react';
import { useOnlineStore } from '../store/onlineStore';
import { getSocket } from '../services/socket';

export const useOnlineUsers = () => {
  const { setOnlineUsers } = useOnlineStore();
  const socket = getSocket();

  useEffect(() => {
    const onOnlineUsers = (users) => setOnlineUsers(users);
    socket.on('online_users', onOnlineUsers);
    return () => socket.off('online_users', onOnlineUsers);
  }, [socket, setOnlineUsers]);

  const updateStatus = useCallback((status) => {
    socket.emit('update_status', { status });
  }, [socket]);

  return { updateStatus };
};
