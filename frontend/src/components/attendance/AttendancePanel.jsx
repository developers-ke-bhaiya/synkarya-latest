import React, { useEffect } from 'react';
import { X, Clock, LogIn, LogOut, Users } from 'lucide-react';
import { useAttendance } from '../../hooks/useAttendance';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/Spinner';
import { formatDate, formatDuration } from '../../utils/formatters';

export const AttendancePanel = ({ roomId, onClose }) => {
  const { roomAttendance, loading, error, fetchRoomAttendance } = useAttendance();

  useEffect(() => {
    if (roomId) fetchRoomAttendance(roomId);
  }, [roomId]);

  const active = roomAttendance.filter((r) => r.status === 'active');
  const completed = roomAttendance.filter((r) => r.status === 'completed');

  return (
    <div className="fixed inset-y-0 right-0 w-96 z-50 flex flex-col animate-slide-in-right shadow-2xl"
      style={{ background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Attendance
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{roomAttendance.length} total records</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center
            text-slate-400 hover:text-white transition-all">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {loading && (
          <div className="flex justify-center py-10"><Spinner /></div>
        )}
        {error && (
          <div className="text-red-400 text-sm text-center py-6">{error}</div>
        )}

        {/* Active now */}
        {active.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="label mb-0">In call ({active.length})</span>
            </div>
            <div className="space-y-2">
              {active.map((r) => (
                <AttendanceRow key={r.recordId} record={r} isActive />
              ))}
            </div>
          </section>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <section>
            <span className="label">Left the call ({completed.length})</span>
            <div className="space-y-2">
              {completed.map((r) => (
                <AttendanceRow key={r.recordId} record={r} />
              ))}
            </div>
          </section>
        )}

        {!loading && roomAttendance.length === 0 && (
          <div className="text-center text-slate-600 py-10 text-sm">
            No attendance records yet
          </div>
        )}
      </div>
    </div>
  );
};

const AttendanceRow = ({ record, isActive = false }) => (
  <div className="flex items-start gap-3 p-3 rounded-xl"
    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
    <Avatar name={record.displayName} size="sm" />
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white truncate">{record.displayName}</span>
        {isActive ? (
          <span className="badge bg-emerald-400/15 text-emerald-400 border border-emerald-400/20 flex-shrink-0">
            Live
          </span>
        ) : (
          <span className="text-xs text-slate-500 flex-shrink-0">
            {formatDuration(record.durationSeconds)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <LogIn size={10} className="text-emerald-400" />
          {formatDate(record.joinTime)}
        </span>
        {record.leaveTime && (
          <span className="flex items-center gap-1">
            <LogOut size={10} className="text-red-400" />
            {formatDate(record.leaveTime)}
          </span>
        )}
      </div>
    </div>
  </div>
);
