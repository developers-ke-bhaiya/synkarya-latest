import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';

const AttendanceTable = lazy(() => import('../components/attendance/AttendanceTable'));
import { Plus, Hash, LogOut, RefreshCw, Zap, ClipboardList, Video } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { roomsApi } from '../services/api';
import { useRoom } from '../hooks/useRoom';
import RoomCard from '../components/layout/RoomCard';
import CreateRoomModal from '../components/layout/CreateRoomModal';
import JoinByCodeModal from '../components/layout/JoinByCodeModal';
import { disconnectSocket } from '../services/socket';

const DashboardPage = () => {
  const { user, logout } = useAuthStore();
  const { joinRoom } = useRoom();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' | 'attendance'

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const { data } = await roomsApi.list();
      setRooms(data.rooms);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate('/login');
  };

  const handleRoomCreated = (room) => {
    setRooms((prev) => [room, ...prev]);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Top Nav */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b border-white/6 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-400 flex items-center justify-center">
            <Zap size={17} className="text-navy-950" fill="currentColor" />
          </div>
          <span className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
            Synkarya
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xs font-bold text-navy-950"
              style={{ fontFamily: 'Syne, sans-serif' }}>
              {user?.displayName?.slice(0, 2).toUpperCase()}
            </div>
            <span className="hidden sm:block">{user?.displayName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-slate-500 hover:text-red-400 text-sm transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/8"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 max-w-5xl mx-auto w-full">
        {/* Hero section */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>
            Welcome back, {user?.displayName?.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-500">Join an existing room or start a new one.</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-4 p-5 card hover:border-amber-400/25 transition-all duration-200 text-left group"
          >
            <div className="w-11 h-11 rounded-2xl bg-amber-400/10 flex items-center justify-center group-hover:bg-amber-400/20 transition-colors flex-shrink-0">
              <Plus size={22} className="text-amber-400" />
            </div>
            <div>
              <p className="text-white font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>
                Create Room
              </p>
              <p className="text-slate-500 text-sm">Start a new meeting room</p>
            </div>
          </button>

          <button
            onClick={() => setShowJoinCode(true)}
            className="flex items-center gap-4 p-5 card hover:border-white/15 transition-all duration-200 text-left group"
          >
            <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-white/8 transition-colors flex-shrink-0">
              <Hash size={22} className="text-slate-400" />
            </div>
            <div>
              <p className="text-white font-semibold" style={{ fontFamily: 'Syne, sans-serif' }}>
                Join by Code
              </p>
              <p className="text-slate-500 text-sm">Enter a 6-character room code</p>
            </div>
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 mb-5 border-b border-white/6">
          {[
            { id: 'rooms', icon: Video, label: 'Open Rooms' },
            { id: 'attendance', icon: ClipboardList, label: 'My Attendance' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                activeTab === id
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
              style={{ fontFamily: 'Syne, sans-serif' }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}

          {activeTab === 'rooms' && (
            <button
              onClick={fetchRooms}
              className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-2"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}
        </div>

        {/* Rooms tab */}
        {activeTab === 'rooms' && (
          <>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="card p-4 animate-pulse">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-white/5" />
                      <div className="flex-1">
                        <div className="h-3 bg-white/5 rounded w-3/4 mb-2" />
                        <div className="h-2 bg-white/4 rounded w-1/2" />
                      </div>
                    </div>
                    <div className="h-2 bg-white/4 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-16">
                <Video size={40} className="mx-auto mb-4 text-slate-700" />
                <h3 className="text-lg font-semibold text-slate-400 mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>
                  No open rooms yet
                </h3>
                <p className="text-slate-600 text-sm mb-6">Create a room to get started</p>
                <button onClick={() => setShowCreate(true)} className="btn-primary mx-auto">
                  <Plus size={16} /> Create Room
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((room) => (
                  <RoomCard key={room.roomId} room={room} onJoin={joinRoom} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Attendance tab */}
        {activeTab === 'attendance' && (
          <div className="animate-fade-in">
            {/* Lazy import attendance table */}
            <AttendanceLazy />
          </div>
        )}
      </main>

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreate={handleRoomCreated}
        />
      )}
      {showJoinCode && (
        <JoinByCodeModal
          onClose={() => setShowJoinCode(false)}
          onJoin={joinRoom}
        />
      )}
    </div>
  );
};

const AttendanceLazy = () => (
  <Suspense fallback={<div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading…</div>}>
    <AttendanceTable title="My Call History" />
  </Suspense>
);

export default DashboardPage;
