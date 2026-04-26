import { useState, useCallback } from 'react';
import { attendanceApi } from '../services/api';

export const useAttendance = () => {
  const [roomAttendance, setRoomAttendance] = useState([]);
  const [myAttendance, setMyAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRoomAttendance = useCallback(async (roomId) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await attendanceApi.getRoomAttendance(roomId);
      setRoomAttendance(data.attendance || []);
    } catch (err) {
      setError('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyAttendance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await attendanceApi.getMyAttendance();
      setMyAttendance(data.attendance || []);
    } catch (err) {
      setError('Failed to load your attendance');
    } finally {
      setLoading(false);
    }
  }, []);

  const formatDuration = (seconds) => {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  return {
    roomAttendance,
    myAttendance,
    loading,
    error,
    fetchRoomAttendance,
    fetchMyAttendance,
    formatDuration,
  };
};
