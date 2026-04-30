import { useEffect } from 'react';
import { useOnlineStore } from '../store/onlineStore';
import { getSocket } from '../services/socket';

export const useOnlineUsers = () => {
  const { setOnlineUsers } = useOnlineStore();

  useEffect(() => {
    const socket = getSocket();

    const onOnlineUsers = (users) => {
      setOnlineUsers(Array.isArray(users) ? users : []);
    };

    // FIX: remove stale listener before adding — prevents accumulation
    socket.off('online_users', onOnlineUsers);
    socket.on('online_users', onOnlineUsers);

    // Request current list immediately
    socket.emit('ping');

    // FIX: also re-request when socket reconnects (after network drop)
    const onReconnect = () => {
      console.log('[Online] Socket reconnected — refreshing online list');
      socket.emit('ping');
    };
    socket.io?.on('reconnect', onReconnect);

    return () => {
      socket.off('online_users', onOnlineUsers);
      socket.io?.off('reconnect', onReconnect);
    };
  }, [setOnlineUsers]);
};
