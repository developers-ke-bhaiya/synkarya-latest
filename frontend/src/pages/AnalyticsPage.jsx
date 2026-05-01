import React, { useState, useCallback } from 'react';
import {
  BarChart2, Clock, Users, Search, ChevronDown, ChevronUp,
  Activity, Zap, Hash, Calendar,
} from 'lucide-react';
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
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

const Bar = ({ pct, color }) => (
  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
    <div className="h-full rounded-full transition-all duration-700"
      style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
  </div>
);

const COLORS = ['#f59e0b', '#10b981', '#6366f1', '#f43f5e', '#06b6d4', '#a855f7'];

// ── User card: room sessions + status history ─────────────────────────────────
const UserRow = ({ u, maxSeconds, index, statusMap }) => {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('sessions'); // 'sessions' | 'status'
  const pct = maxSeconds > 0 ? (u.totalSeconds / maxSeconds) * 100 : 0;
  const color = COLORS[index % COLORS.length];
  const statuses = statusMap[u.uid] || [];

  return (
    <div className="card overflow-hidden" style={{ marginBottom: 8 }}>
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
        style={{ ':hover': { background: 'rgba(255,255,255,0.02)' } }}>
        <div className="relative flex-shrink-0">
          <Avatar name={u.displayName} size="sm" />
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: color, color: '#0b0e14' }}>
            {index + 1}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <p className="font-semibold text-white text-sm truncate" style={{ fontFamily: 'Syne, sans-serif' }}>
              {u.displayName}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {statuses.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontSize: 10 }}>
                  {statuses.length} status
                </span>
              )}
              <span className="text-sm font-bold" style={{ color }}>{fmt(u.totalSeconds)}</span>
            </div>
          </div>
          <Bar pct={pct} color={color} />
          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <Hash size={10} /> {u.sessionCount} sessions
            </span>
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <Activity size={10} /> {u.roomsVisited} rooms
            </span>
          </div>
        </div>
        <div className="flex-shrink-0 ml-1" style={{ color: 'var(--text-muted)' }}>
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </button>

      {expanded && (
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          {/* Tab switcher */}
          <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
            {[
              { key: 'sessions', label: `Room Sessions (${u.sessionCount})`, icon: <Hash size={11} /> },
              { key: 'status', label: `Status Log (${statuses.length})`, icon: <Zap size={11} /> },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all flex-1 justify-center"
                style={{
                  color: tab === t.key ? color : 'var(--text-muted)',
                  borderBottom: tab === t.key ? `2px solid ${color}` : '2px solid transparent',
                  background: tab === t.key ? `${color}08` : 'transparent',
                  fontFamily: 'Syne, sans-serif',
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="p-3 overflow-y-auto" style={{ maxHeight: 240 }}>
            {tab === 'sessions' ? (
              <div className="space-y-1.5">
                {u.sessions.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>No sessions</p>
                ) : u.sessions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-2 px-3 rounded-xl"
                    style={{ background: 'var(--bg-elevated)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-white truncate font-medium">{s.roomName}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      <span style={{ color: 'var(--text-muted)' }}>{fmtDate(s.joinTime)}</span>
                      <span className="font-bold tabular-nums" style={{ color }}>{fmt(s.durationSeconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {statuses.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
                    Is period mein koi status set nahi kiya
                  </p>
                ) : statuses.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-2 px-3 rounded-xl"
                    style={{ background: 'var(--bg-elevated)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base flex-shrink-0">🎯</span>
                      <span className="text-white truncate">{s.status}</span>
                    </div>
                    <span className="flex-shrink-0 ml-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {fmtDate(s.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
export const AnalyticsPage = () => {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState(null);
  const [statusMap, setStatusMap] = useState({}); // uid → status[]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both in parallel
      const [workRes, statusRes] = await Promise.all([
        analyticsApi.getWorkSummary({ startDate, endDate }),
        analyticsApi.getStatusTimeline({ startDate, endDate }),
      ]);

      const summary = workRes.data.summary || [];
      const entries = statusRes.data.entries || [];

      // Build uid → status entries map
      const map = {};
      for (const e of entries) {
        if (!map[e.uid]) map[e.uid] = [];
        map[e.uid].push(e);
      }

      setData(summary);
      setStatusMap(map);
      setSearched(true);
    } catch (err) {
      setError('Data load failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const totalTime = data?.reduce((s, u) => s + u.totalSeconds, 0) || 0;
  const maxSeconds = data?.[0]?.totalSeconds || 1;
  const totalStatuses = Object.values(statusMap).reduce((s, a) => s + a.length, 0);

  const presets = [
    { label: 'Today', start: today, end: today },
    { label: 'Yesterday', start: new Date(Date.now() - 86400000).toISOString().slice(0, 10), end: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
    { label: 'This week', start: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })(), end: today },
    { label: 'This month', start: today.slice(0, 7) + '-01', end: today },
  ];

  return (
    // FIX: h-screen + overflow-y-auto on inner div = proper scroll
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>

      {/* Fixed header */}
      <div className="flex-shrink-0 px-4 sm:px-8 py-5"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent-dim)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <BarChart2 size={17} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Work Analytics</h1>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Room sessions + status history — ek jagah</p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-5 space-y-5 pb-10">

          {/* Filter card */}
          <div className="card p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {presets.map(p => (
                <button key={p.label}
                  onClick={() => { setStartDate(p.start); setEndDate(p.end); }}
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
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[130px]">
                <label className="label mb-1 block">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="input-field text-sm py-2" max={endDate} />
              </div>
              <div className="flex-1 min-w-[130px]">
                <label className="label mb-1 block">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="input-field text-sm py-2" min={startDate} max={today} />
              </div>
              <button onClick={load} disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all"
                style={{ background: 'var(--accent)', color: '#0b0e14', fontFamily: 'Syne, sans-serif' }}>
                {loading
                  ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <Search size={14} />}
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

          {/* Results */}
          {searched && data && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: <Users size={15} />, label: 'Members', value: data.length, color: '#6366f1' },
                  { icon: <Clock size={15} />, label: 'Total time', value: fmt(totalTime), color: 'var(--accent)' },
                  { icon: <Activity size={15} />, label: 'Sessions', value: data.reduce((s, u) => s + u.sessionCount, 0), color: '#10b981' },
                  { icon: <Zap size={15} />, label: 'Status updates', value: totalStatuses, color: '#a855f7' },
                ].map(stat => (
                  <div key={stat.label} className="card p-3 text-center">
                    <div className="w-7 h-7 rounded-lg mx-auto mb-1.5 flex items-center justify-center"
                      style={{ background: `${stat.color}18`, color: stat.color }}>
                      {stat.icon}
                    </div>
                    <p className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>{stat.value}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* User rows */}
              {data.length === 0 ? (
                <div className="card p-10 text-center">
                  <BarChart2 size={30} className="mx-auto mb-3 opacity-20" />
                  <p style={{ color: 'var(--text-secondary)' }}>Is period mein koi data nahi mila</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Date range change karke try karo</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: 'var(--text-muted)', fontFamily: 'Syne, sans-serif' }}>
                    {startDate === endDate ? startDate : `${startDate} → ${endDate}`} · {data.length} members
                  </p>
                  {data.map((u, i) => (
                    <UserRow key={u.uid} u={u} maxSeconds={maxSeconds} index={i} statusMap={statusMap} />
                  ))}
                </div>
              )}
            </>
          )}

          {!searched && !loading && (
            <div className="card p-12 text-center">
              <BarChart2 size={36} className="mx-auto mb-3 opacity-15" />
              <p className="font-semibold text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>Analytics ready hai</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Date range select karo aur Search karo</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
