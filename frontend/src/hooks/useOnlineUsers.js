import { useEffect, useCallback } from 'react';
import { useOnlineStore } from '../store/onlineStore';
import { getSocket } from '../services/socket';
import { usersApi } from '../services/api';

export const useOnlineUsers = () => {
  const { setOnlineUsers } = useOnlineStore();
  const socket = getSocket();

  // Fetch initial online users from REST API on mount
  useEffect(() => {
    usersApi.getOnlineUsers()
      .then(({ data }) => {
        if (data.users?.length > 0) {
          // Merge with socket list — socket list is more up to date
          // but REST gives us users who may not have emitted yet
          setOnlineUsers(data.users);
        }
      })
      .catch((err) => console.warn('getOnlineUsers REST error:', err.message));
  }, []);

  // Real-time updates via socket
  useEffect(() => {
    const onOnlineUsers = (users) => setOnlineUsers(users);
    socket.off('online_users', onOnlineUsers);
    socket.on('online_users', onOnlineUsers);
    return () => socket.off('online_users', onOnlineUsers);
  }, [socket, setOnlineUsers]);

  const updateStatus = useCallback((status) => {
    socket.emit('update_status', { status });
  }, [socket]);

  return { updateStatus };
};
