import { useState, useEffect } from 'react';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import { attendanceApi } from '../../services/api';
import { Clock, User, LogIn, LogOut, Timer } from 'lucide-react';
import clsx from 'clsx';

const formatDur = (seconds) => {
  if (!seconds) return '—';
  const dur = intervalToDuration({ start: 0, end: seconds * 1000 });
  const parts = [];
  if (dur.hours) parts.push(`${dur.hours}h`);
  if (dur.minutes) parts.push(`${dur.minutes}m`);
  if (dur.seconds && !dur.hours) parts.push(`${dur.seconds}s`);
  return parts.join(' ') || '< 1s';
};

const StatusBadge = ({ status }) => (
  <span
    className={clsx(
      'badge',
      status === 'active'
        ? 'bg-green-500/15 text-green-400'
        : 'bg-slate-500/15 text-slate-400'
    )}
  >
    {status === 'active' ? '● Live' : 'Completed'}
  </span>
);

const AttendanceTable = ({ roomId, title = 'Attendance Log' }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFn = roomId
      ? () => attendanceApi.getRoomAttendance(roomId)
      : () => attendanceApi.getMyAttendance();

    fetchFn()
      .then(({ data }) => {
        setRecords(data.attendance);
        setLoading(false);
      })
      .catch((err) => {
        setError('Failed to load attendance');
        setLoading(false);
      });
  }, [roomId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
          Loading attendance…
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400 text-sm p-4">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
          {title}
        </h2>
        <span className="badge bg-amber-400/10 text-amber-400">
          {records.length} record{records.length !== 1 ? 's' : ''}
        </span>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Clock size={32} className="mx-auto mb-3 opacity-30" />
          <p>No attendance records yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/6">
                {['Participant', 'Room', 'Joined', 'Left', 'Duration', 'Status'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    style={{ fontFamily: 'Syne, sans-serif' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/4">
              {records.map((rec) => (
                <tr
                  key={rec.recordId}
                  className="hover:bg-white/2 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xs font-bold text-navy-950">
                        {rec.displayName?.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-white font-medium">{rec.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 max-w-[140px] truncate">
                    {rec.roomName}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <LogIn size={12} className="text-green-400" />
                      {format(new Date(rec.joinTime), 'MMM d, HH:mm')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {rec.leaveTime ? (
                      <div className="flex items-center gap-1.5">
                        <LogOut size={12} className="text-red-400" />
                        {format(new Date(rec.leaveTime), 'MMM d, HH:mm')}
                      </div>
                    ) : (
                      <span className="text-green-400">Still in call</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Timer size={12} className="text-amber-400" />
                      <span className="text-white font-medium font-mono">
                        {formatDur(rec.durationSeconds)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={rec.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AttendanceTable;
