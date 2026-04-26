import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, LogIn, LogOut, Hash } from 'lucide-react';
import { useAttendance } from '../hooks/useAttendance';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/ui/Avatar';
import { Spinner } from '../components/ui/Spinner';
import { formatDate, formatDuration } from '../utils/formatters';

export const MyAttendancePage = () => {
  const { myAttendance, loading, error, fetchMyAttendance } = useAttendance();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => { fetchMyAttendance(); }, []);

  const totalDuration = myAttendance.reduce((sum, r) => sum + (r.durationSeconds || 0), 0);
  const sessions = myAttendance.filter((r) => r.status === 'completed').length;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => navigate('/')}
          className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center
            text-slate-400 hover:text-white transition-all">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            My Attendance
          </h1>
          <p className="text-xs text-slate-500">Your session history</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total sessions', value: sessions, icon: <Hash size={18} className="text-amber-400" /> },
            { label: 'Total time', value: formatDuration(totalDuration), icon: <Clock size={18} className="text-violet-400" /> },
            { label: 'Active now', value: myAttendance.filter((r) => r.status === 'active').length, icon: <div className="w-4 h-4 rounded-full bg-emerald-400 animate-pulse" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="card p-4 flex items-center gap-3">
              {icon}
              <div>
                <p className="text-xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* History */}
        {loading && <div className="flex justify-center py-10"><Spinner /></div>}
        {error && <p className="text-red-400 text-center py-6">{error}</p>}

        {!loading && myAttendance.length === 0 && (
          <div className="card p-10 text-center text-slate-600">
            No sessions yet. Join a call to start tracking!
          </div>
        )}

        <div className="space-y-3">
          {myAttendance.map((record) => (
            <div key={record.recordId} className="card p-4 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center flex-shrink-0">
                <Hash size={16} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-semibold text-white truncate">{record.roomName || record.roomId}</span>
                  {record.status === 'active' ? (
                    <span className="badge bg-emerald-400/15 text-emerald-400 border border-emerald-400/20">Live</span>
                  ) : (
                    <span className="badge bg-white/5 text-slate-400 border border-white/5">
                      {formatDuration(record.durationSeconds)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <LogIn size={10} className="text-emerald-400" />
                    Joined {formatDate(record.joinTime)}
                  </span>
                  {record.leaveTime && (
                    <span className="flex items-center gap-1">
                      <LogOut size={10} className="text-red-400" />
                      Left {formatDate(record.leaveTime)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
