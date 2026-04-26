import { Users, ArrowRight, Lock, Globe, Crown } from 'lucide-react';
import clsx from 'clsx';

const RoomCard = ({ room, onJoin }) => {
  return (
    <div
      className="card p-4 hover:border-amber-400/20 transition-all duration-200 group cursor-pointer"
      onClick={() => onJoin(room)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {room.type === 'private' ? (
            <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center">
              <Lock size={14} className="text-slate-400" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center">
              <Globe size={14} className="text-amber-400" />
            </div>
          )}
          <div>
            <h3 className="text-white font-semibold text-sm truncate max-w-[160px]"
              style={{ fontFamily: 'Syne, sans-serif' }}>
              {room.name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">by {room.hostName}</p>
          </div>
        </div>
        <ArrowRight
          size={16}
          className="text-slate-600 group-hover:text-amber-400 group-hover:translate-x-1 transition-all duration-200 mt-1"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Users size={13} />
          <span className="text-xs">{room.participantCount || 0} online</span>
        </div>
        <span className="font-mono text-xs text-slate-600 bg-white/4 px-2 py-0.5 rounded-lg">
          {room.code}
        </span>
      </div>
    </div>
  );
};

export default RoomCard;
