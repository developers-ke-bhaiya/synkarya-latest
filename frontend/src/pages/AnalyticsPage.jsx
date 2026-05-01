import React, { useState, useCallback } from 'react';
import { BarChart2, Clock, Users, Calendar, Search, ChevronDown, ChevronUp, Activity, Filter } from 'lucide-react';
import { analyticsApi } from '../services/api';
import { Avatar } from '../components/ui/Avatar';

const fmt = (secs) => {
  if (!secs || secs < 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const Bar = ({ pct, color = 'var(--accent)' }) => (
  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
  </div>
);

const UserRow = ({ u, maxSeconds, index }) => {
  const [expanded, setExpanded] = useState(false);
  const pct = maxSeconds > 0 ? (u.totalSeconds / maxSeconds) * 100 : 0;
  const colors = ['var(--accent)', '#10b981', '#6366f1', '#f43f5e', '#06b6d4'];
  const color = colors[index % colors.length];

  return (
    <div className="card overflow-hidden" style={{ marginBottom: 8 }}>
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/2 transition-all">
        <div className="relative flex-shrink-0">
          <Avatar name={u.displayName} size="sm" />
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: color, color: '#0b0e14' }}>
            {index + 1}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="font-semibold text-white text-sm truncate" style={{ fontFamily: 'Syne, sans-serif' }}>
              {u.displayName}
            </p>
            <span className="text-sm font-bold flex-shrink-0 ml-2" style={{ color }}>{fmt(u.totalSeconds)}</span>
          </div>
          <Bar pct={pct} color={color} />
          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.sessionCount} sessions</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{u.roomsVisited} rooms</span>
          </div>
        </div>
        <div className="flex-shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 pb-3" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-widest mt-3 mb-2" style={{ color: 'var(--text-muted)', fontFamily: 'Syne, sans-serif' }}>
            Sessions
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {u.sessions.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-2 px-3 rounded-xl"
                style={{ background: 'var(--bg-elevated)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-white truncate font-medium">{s.roomName}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  <span style={{ color: 'var(--text-muted)' }}>{fmtDate(s.joinTime)}</span>
                  <span className="font-semibold" style={{ color }}>{fmt(s.durationSeconds)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const AnalyticsPage = () => {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await analyticsApi.getWorkSummary({ startDate, endDate });
      setData(res.summary || []);
      setSearched(true);
    } catch (err) {
      setError('Data load failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const totalTime = data?.reduce((s, u) => s + u.totalSeconds, 0) || 0;
  const maxSeconds = data?.[0]?.totalSeconds || 1;

  const presets = [
    { label: 'Today', start: today, end: today },
    { label: 'Yesterday', start: new Date(Date.now() - 86400000).toISOString().slice(0, 10), end: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
    { label: 'This week', start: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })(), end: today },
    { label: 'This month', start: today.slice(0, 7) + '-01', end: today },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="px-4 sm:px-8 py-6" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-dim)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <BarChart2 size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Work Analytics</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Dekho kon kab kitna kaam kiya</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 space-y-6">

        {/* Filter card */}
        <div className="card p-5 space-y-4">
          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button key={p.label} onClick={() => { setStartDate(p.start); setEndDate(p.end); }}
                className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
                style={{
                  background: startDate === p.start && endDate === p.end ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)',
                  color: startDate === p.start && endDate === p.end ? 'var(--accent)' : 'var(--text-muted)',
                  border: startDate === p.start && endDate === p.end ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--border)',
                  fontFamily: 'Syne, sans-serif',
                }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Date inputs */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="label mb-1.5 block">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="input-field text-sm py-2" max={endDate} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="label mb-1.5 block">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="input-field text-sm py-2" min={startDate} max={today} />
            </div>
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all"
              style={{ background: 'var(--accent)', color: '#0b0e14', fontFamily: 'Syne, sans-serif' }}>
              {loading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : <Search size={15} />}
              Search
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl text-sm" style={{ background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {/* Stats row */}
        {searched && data && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: <Users size={16} />, label: 'Active members', value: data.length, color: '#6366f1' },
                { icon: <Clock size={16} />, label: 'Total work time', value: fmt(totalTime), color: 'var(--accent)' },
                { icon: <Activity size={16} />, label: 'Total sessions', value: data.reduce((s, u) => s + u.sessionCount, 0), color: '#10b981' },
              ].map(stat => (
                <div key={stat.label} className="card p-4 text-center">
                  <div className="w-8 h-8 rounded-xl mx-auto mb-2 flex items-center justify-center"
                    style={{ background: `${stat.color}18`, color: stat.color }}>
                    {stat.icon}
                  </div>
                  <p className="text-xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>{stat.value}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                </div>
              ))}
            </div>

            {/* User list */}
            {data.length === 0 ? (
              <div className="card p-10 text-center">
                <BarChart2 size={32} className="mx-auto mb-3 opacity-20" />
                <p style={{ color: 'var(--text-secondary)' }}>Is period mein koi data nahi mila</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Date range change karke try karo</p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)', fontFamily: 'Syne, sans-serif' }}>
                  {startDate === endDate ? startDate : `${startDate} → ${endDate}`} · {data.length} members
                </p>
                {data.map((u, i) => <UserRow key={u.uid} u={u} maxSeconds={maxSeconds} index={i} />)}
              </div>
            )}
          </>
        )}

        {!searched && !loading && (
          <div className="card p-12 text-center">
            <BarChart2 size={40} className="mx-auto mb-4 opacity-15" />
            <p className="font-semibold text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>Analytics ready hai</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Date range select karo aur Search karo</p>
          </div>
        )}
      </div>
    </div>
  );
};
