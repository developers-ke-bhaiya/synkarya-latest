import React, { useState, useEffect } from 'react';
import {
  Zap, Hash, Plus, Search, LogOut, Globe, Lock, ChevronRight, ClipboardList
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';
import { roomsApi } from '../../services/api';
import { Avatar } from '../ui/Avatar';
import { useToast } from '../ui/Toast';
import { Spinner } from '../ui/Spinner';
import { getSocket, disconnectSocket } from '../../services/socket';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useChat } from '../../hooks/useChat';

export const Sidebar = ({ onRoomJoined }) => {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(null);
  const [createForm, setCreateForm] = useState({ name: '', type: 'open' });
  const [creating, setCreating] = useState(false);

  const { user, logout } = useAuthStore();
  const { currentRoom, inCall } = useCallStore();
  const { addToast } = useToast();
  const { initLocalStream } = useWebRTC();
  const { loadHistory } = useChat();
  const navigate = useNavigate();

  useEffect(() => { loadRooms(); }, []);

  const loadRooms = async () => {
    setLoadingRooms(true);
    try {
      const { data } = await roomsApi.list();
      setRooms(data.rooms || []);
    } catch {
      addToast('Failed to load rooms', 'error');
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const { data } = await roomsApi.create(createForm);
      setRooms((prev) => [data.room, ...prev]);
      setShowCreate(false);
      setCreateForm({ name: '', type: 'open' });
      addToast(`Room "${data.room.name}" created! Code: ${data.room.code}`, 'success');
      await joinRoom(data.room);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to create room', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    try {
      const { data } = await roomsApi.getByCode(joinCode.trim());
      await joinRoom(data.room);
      setShowJoinCode(false);
      setJoinCode('');
    } catch {
      addToast('Room not found. Check the code and try again.', 'error');
    }
  };

  const joinRoom = async (room) => {
    if (currentRoom?.roomId === room.roomId) return;
    if (inCall) { addToast('Leave current call first', 'info'); return; }

    setJoiningRoom(room.roomId);
    try {
      await initLocalStream();
      const { setCurrentRoom, setInCall } = useCallStore.getState();
      setCurrentRoom(room);
      setInCall(true);
      const socket = getSocket();
      socket.emit('join_room', { roomId: room.roomId, roomName: room.name });
      await loadHistory(room.roomId);
      onRoomJoined?.(room);
    } catch (err) {
      addToast('Failed to access camera/mic. Check browser permissions.', 'error');
      console.error(err);
    } finally {
      setJoiningRoom(null);
    }
  };

  const handleLogout = () => {
    if (inCall) {
      const socket = getSocket();
      socket.emit('leave_room');
      useCallStore.getState().cleanupCall();
    }
    disconnectSocket();
    logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col w-64 flex-shrink-0 h-full" style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
          <Zap size={16} className="text-white" fill="white" />
        </div>
        <span className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '-0.02em' }}>
          Synkarya
        </span>
      </div>

      {/* Actions */}
      <div className="px-3 py-3 space-y-0.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => { setShowCreate(true); setShowJoinCode(false); }} className="sidebar-item w-full text-left">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
            <Plus size={12} style={{ color: 'var(--accent)' }} />
          </div>
          <span className="text-sm">Create room</span>
        </button>
        <button onClick={() => { setShowJoinCode(true); setShowCreate(false); }} className="sidebar-item w-full text-left">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <Search size={12} className="text-slate-400" />
          </div>
          <span className="text-sm">Join by code</span>
        </button>
        <button onClick={() => navigate('/attendance')} className="sidebar-item w-full text-left">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <ClipboardList size={12} className="text-slate-400" />
          </div>
          <span className="text-sm">Attendance</span>
        </button>
      </div>

      {/* Create room form */}
      {showCreate && (
        <form onSubmit={handleCreateRoom} className="px-3 py-3 space-y-2 animate-slide-up" style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            className="input-field text-sm py-2"
            placeholder="Room name"
            value={createForm.name}
            onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus required
          />
          <div className="flex gap-2">
            {['open', 'private'].map((t) => (
              <button key={t} type="button"
                onClick={() => setCreateForm((f) => ({ ...f, type: t }))}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs transition-all ${
                  createForm.type === t
                    ? 'text-amber-400'
                    : 'text-slate-500 hover:text-white'
                }`}
                style={{
                  background: createForm.type === t ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)',
                  border: createForm.type === t ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--border)',
                }}>
                {t === 'open' ? <Globe size={11} /> : <Lock size={11} />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowCreate(false)}
              className="flex-1 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
              Cancel
            </button>
            <button type="submit" disabled={creating}
              className="flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1"
              style={{ background: 'var(--accent)', color: '#0b0e14', fontFamily: 'Syne, sans-serif' }}>
              {creating ? <Spinner size="sm" /> : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Join by code */}
      {showJoinCode && (
        <form onSubmit={handleJoinByCode} className="px-3 py-3 space-y-2 animate-slide-up" style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            className="input-field text-sm py-2 font-mono uppercase tracking-widest"
            placeholder="ROOM CODE"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6} autoFocus
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowJoinCode(false)}
              className="flex-1 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
              Cancel
            </button>
            <button type="submit"
              className="flex-1 py-1.5 rounded-xl text-xs font-semibold"
              style={{ background: 'var(--accent)', color: '#0b0e14', fontFamily: 'Syne, sans-serif' }}>
              Join
            </button>
          </div>
        </form>
      )}

      {/* Rooms list */}
      <div className="flex-1 overflow-y-auto py-3">
        <div className="px-4 mb-2 flex items-center justify-between">
          <span className="label" style={{ marginBottom: 0 }}>Rooms</span>
          <button onClick={loadRooms} className="text-xs transition-colors" style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            Refresh
          </button>
        </div>

        {loadingRooms ? (
          <div className="space-y-1 px-2">
            {[1,2,3].map(i => (
              <div key={i} className="skeleton h-10 rounded-xl" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <p className="text-xs text-center py-6 px-4" style={{ color: 'var(--text-muted)' }}>
            No rooms yet — create one above!
          </p>
        ) : (
          <div className="px-2 space-y-0.5">
            {rooms.map((room) => {
              const isActive = currentRoom?.roomId === room.roomId;
              const isJoining = joiningRoom === room.roomId;
              return (
                <button
                  key={room.roomId}
                  onClick={() => joinRoom(room)}
                  disabled={isJoining}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-150 text-left group ${
                    isActive ? 'text-amber-400' : 'text-slate-400 hover:text-white'
                  }`}
                  style={{
                    background: isActive ? 'var(--accent-dim)' : 'transparent',
                    border: isActive ? '1px solid rgba(245,158,11,0.15)' : '1px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Hash size={13} className={isActive ? 'text-amber-400' : 'text-slate-600'} style={{ flexShrink: 0 }} />
                  <span className="text-sm flex-1 truncate font-medium">{room.name}</span>
                  {isJoining ? (
                    <Spinner size="sm" />
                  ) : (
                    <ChevronRight size={12} className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* User profile */}
      <div className="px-3 py-3 flex items-center gap-3" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="relative flex-shrink-0">
          <Avatar name={user?.displayName || '?'} size="sm" />
          <div className="online-dot" style={{ width: 8, height: 8 }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate" style={{ fontFamily: 'Syne, sans-serif' }}>{user?.displayName || 'User'}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email || ''}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
          style={{ color: 'var(--text-muted)', background: 'transparent' }}
          title="Sign out"
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-dim)'; e.currentTarget.style.color = 'var(--danger)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
};
