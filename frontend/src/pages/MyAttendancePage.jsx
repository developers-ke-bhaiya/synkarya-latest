import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, LogIn, LogOut, Hash, Briefcase } from 'lucide-react';
import { useAttendance } from '../hooks/useAttendance';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatDuration } from '../utils/formatters';
import { usersApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

export const MyAttendancePage = () => {
  const { myAttendance, loading, error, fetchMyAttendance } = useAttendance();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [statusHistory, setStatusHistory] = React.useState([]);

  useEffect(() => {
    fetchMyAttendance();
    if (user?.uid) {
      usersApi.getStatusHistory(user.uid).then(({ data }) => setStatusHistory(data.history || [])).catch(() => {});
    }
  }, [user?.uid]);

  const totalDuration = myAttendance.reduce((s, r) => s + (r.durationSeconds || 0), 0);
  const sessions = myAttendance.filter((r) => r.status === 'completed').length;

  return (
    <div className="min-h-screen flex flex-col pb-16 sm:pb-0" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => navigate('/')}
          className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center
            text-slate-400 hover:text-white transition-all">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>My Attendance</h1>
          <p className="text-xs text-slate-500">Your session & work history</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total sessions', value: sessions, icon: <Hash size={16} className="text-amber-400" /> },
            { label: 'Total time', value: formatDuration(totalDuration), icon: <Clock size={16} className="text-violet-400" /> },
            { label: 'Status updates', value: statusHistory.length, icon: <Briefcase size={16} className="text-blue-400" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="card p-4 flex items-center gap-3">
              {icon}
              <div>
                <p className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Status history */}
        {statusHistory.length > 0 && (
          <div>
            <span className="label">Work status history</span>
            <div className="space-y-2">
              {statusHistory.map((s, i) => (
                <div key={i} className="card p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-400/10 flex items-center justify-center flex-shrink-0">
                    <Briefcase size={14} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">🎯 {s.status}</p>
                    <p className="text-xs text-slate-500">{formatDate(s.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Session history */}
        <div>
          <span className="label">Call sessions</span>
          {loading && <div className="flex justify-center py-8"><Spinner /></div>}
          {error && <p className="text-red-400 text-center py-4">{error}</p>}
          {!loading && myAttendance.length === 0 && (
            <div className="card p-8 text-center text-slate-600">No sessions yet. Join a call!</div>
          )}
          <div className="space-y-2">
            {myAttendance.map((record) => (
              <div key={record.recordId} className="card p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center flex-shrink-0">
                  <Hash size={14} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-white text-sm truncate">{record.roomName || record.roomId}</span>
                    {record.status === 'active'
                      ? <span className="badge bg-emerald-400/15 text-emerald-400 border border-emerald-400/20 flex-shrink-0">Live</span>
                      : <span className="badge bg-white/5 text-slate-400 border border-white/5 flex-shrink-0">{formatDuration(record.durationSeconds)}</span>
                    }
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><LogIn size={10} className="text-emerald-400" />Joined {formatDate(record.joinTime)}</span>
                    {record.leaveTime && <span className="flex items-center gap-1"><LogOut size={10} className="text-red-400" />Left {formatDate(record.leaveTime)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
