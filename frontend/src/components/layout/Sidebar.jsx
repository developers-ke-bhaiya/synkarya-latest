import React, { useState, useEffect } from 'react';
import {
  Zap, Hash, Plus, Search, LogOut, ClipboardList,
  Globe, Lock, Loader, Users, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';
import { roomsApi } from '../../services/api';
import { Avatar } from '../ui/Avatar';
import { useToast } from '../ui/Toast';
import { Spinner } from '../ui/Spinner';
import { getSocket } from '../../services/socket';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useChat } from '../../hooks/useChat';
import { disconnectSocket } from '../../services/socket';

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

  useEffect(() => {
    loadRooms();
  }, []);

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
    if (inCall) {
      addToast('Leave current call first', 'info');
      return;
    }
    setJoiningRoom(room.roomId);
    try {
      await initLocalStream();
      const socket = getSocket();
      const { setCurrentRoom, setInCall } = useCallStore.getState();
      setCurrentRoom(room);
      setInCall(true);
      socket.emit('join_room', { roomId: room.roomId, roomName: room.name });
      await loadHistory(room.roomId);
      onRoomJoined?.(room);
    } catch (err) {
      addToast('Failed to access camera/mic. Check permissions.', 'error');
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
  };

  return (
    <div className="flex flex-col w-64 flex-shrink-0 h-full"
      style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600
          flex items-center justify-center flex-shrink-0">
          <Zap size={16} className="text-navy-950" fill="currentColor" />
        </div>
        <span className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
          Synkarya
        </span>
      </div>

      {/* Actions */}
      <div className="px-3 py-3 space-y-1" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => { setShowCreate(true); setShowJoinCode(false); }}
          className="sidebar-item w-full text-left">
          <Plus size={16} className="text-amber-400" />
          <span className="text-sm">Create room</span>
        </button>
        <button onClick={() => { setShowJoinCode(true); setShowCreate(false); }}
          className="sidebar-item w-full text-left">
          <Search size={16} />
          <span className="text-sm">Join by code</span>
        </button>
      </div>

      {/* Create room form */}
      {showCreate && (
        <form onSubmit={handleCreateRoom}
          className="px-3 py-3 space-y-2 animate-slide-up"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            className="input-field text-sm py-2"
            placeholder="Room name"
            value={createForm.name}
            onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
            required
          />
          <div className="flex gap-2">
            <button type="button"
              onClick={() => setCreateForm((f) => ({ ...f, type: 'open' }))}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs
                transition-all ${createForm.type === 'open'
                  ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                  : 'bg-white/5 text-slate-500 hover:text-white'}`}>
              <Globe size={11} /> Open
            </button>
            <button type="button"
              onClick={() => setCreateForm((f) => ({ ...f, type: 'private' }))}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs
                transition-all ${createForm.type === 'private'
                  ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                  : 'bg-white/5 text-slate-500 hover:text-white'}`}>
              <Lock size={11} /> Private
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowCreate(false)}
              className="flex-1 py-1.5 rounded-lg text-xs bg-white/5 text-slate-400 hover:text-white transition-all">
              Cancel
            </button>
            <button type="submit" disabled={creating}
              className="flex-1 py-1.5 rounded-lg text-xs bg-amber-400 text-navy-950 font-semibold
                hover:bg-amber-500 transition-all flex items-center justify-center gap-1">
              {creating ? <Spinner size="sm" /> : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Join by code form */}
      {showJoinCode && (
        <form onSubmit={handleJoinByCode}
          className="px-3 py-3 space-y-2 animate-slide-up"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            className="input-field text-sm py-2 font-mono uppercase tracking-widest"
            placeholder="ROOM CODE"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowJoinCode(false)}
              className="flex-1 py-1.5 rounded-lg text-xs bg-white/5 text-slate-400 hover:text-white transition-all">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 py-1.5 rounded-lg text-xs bg-amber-400 text-navy-950 font-semibold
                hover:bg-amber-500 transition-all">
              Join
            </button>
          </div>
        </form>
      )}

      {/* Rooms list */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 mb-2">
          <span className="label">Open rooms</span>
        </div>

        {loadingRooms ? (
          <div className="flex justify-center py-6"><Spinner size="sm" /></div>
        ) : rooms.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-6 px-4">
            No open rooms yet. Create one!
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
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl
                    transition-all duration-200 text-left group
                    ${isActive
                      ? 'bg-amber-400/10 text-amber-400'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                  <Hash size={14} className={isActive ? 'text-amber-400' : 'text-slate-600'} />
                  <span className="text-sm flex-1 truncate">{room.name}</span>
                  {isJoining ? (
                    <Spinner size="sm" />
                  ) : (
                    <ChevronRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* User profile */}
      <div className="px-3 py-3 flex items-center gap-3"
        style={{ borderTop: '1px solid var(--border)' }}>
        <Avatar name={user?.displayName} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
          <p className="text-xs text-slate-500 truncate">@{user?.username}</p>
        </div>
        <button onClick={handleLogout}
          className="w-7 h-7 rounded-lg hover:bg-red-500/15 flex items-center justify-center
            text-slate-500 hover:text-red-400 transition-all"
          title="Sign out">
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
};
