import { useEffect, useCallback, useRef } from 'react';
import { useOnlineStore } from '../store/onlineStore';
import { getSocket } from '../services/socket';
import { usersApi } from '../services/api';

export const useOnlineUsers = () => {
  const { setOnlineUsers } = useOnlineStore();
  const socket = getSocket();
  // FIX: track if we've already fetched REST to avoid duplicate calls
  const hasFetchedRef = useRef(false);

  // FIX: Fetch initial list from REST on mount (once)
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    usersApi.getOnlineUsers()
      .then(({ data }) => {
        if (data.users?.length > 0) {
          setOnlineUsers(data.users);
        }
      })
      .catch((err) => console.warn('getOnlineUsers REST error:', err.message));
  }, []);

  // FIX: Real-time socket updates — always register on mount
  useEffect(() => {
    const onOnlineUsers = (users) => {
      setOnlineUsers(users);
    };

    // Remove any stale listener first
    socket.off('online_users', onOnlineUsers);
    socket.on('online_users', onOnlineUsers);

    // FIX: Also request fresh list from server on mount via socket
    // This triggers a broadcastOnline on the backend so we get the current list
    socket.emit('ping');

    return () => {
      socket.off('online_users', onOnlineUsers);
    };
  }, [socket, setOnlineUsers]);

  const updateStatus = useCallback((status) => {
    socket.emit('update_status', { status });
  }, [socket]);

  return { updateStatus };
};
