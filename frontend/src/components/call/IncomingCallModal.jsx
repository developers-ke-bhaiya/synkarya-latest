import React from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { useOnlineStore } from '../../store/onlineStore';
import { useDirectCall } from '../../hooks/useDirectCall';
import { Avatar } from '../ui/Avatar';

export const IncomingCallModal = () => {
  const { incomingCall } = useOnlineStore();
  const { acceptCall, rejectCall } = useDirectCall();

  if (!incomingCall) return null;

  const { fromUid, fromDisplayName, fromAvatar } = incomingCall;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm animate-slide-up">
        <div className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--bg-card)', border: '1px solid rgba(251,191,36,0.3)' }}>
          {/* Amber top bar */}
          <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-amber-600" />

          <div className="p-5">
            <div className="flex items-center gap-4">
              {/* Pulsing avatar */}
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" />
                <Avatar name={fromDisplayName} size="lg" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs text-amber-400 font-semibold uppercase tracking-widest mb-0.5"
                  style={{ fontFamily: 'Syne, sans-serif' }}>
                  Incoming call
                </p>
                <p className="text-white font-bold text-lg truncate" style={{ fontFamily: 'Syne, sans-serif' }}>
                  {fromDisplayName}
                </p>
                <p className="text-slate-500 text-sm">wants to connect with you</p>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => rejectCall(fromUid)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                  bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white
                  transition-all duration-200 font-semibold text-sm"
                style={{ fontFamily: 'Syne, sans-serif' }}>
                <PhoneOff size={16} /> Decline
              </button>
              <button
                onClick={() => acceptCall(fromUid, fromDisplayName, fromAvatar)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                  bg-emerald-500 hover:bg-emerald-400 text-white
                  transition-all duration-200 font-semibold text-sm shadow-lg shadow-emerald-500/30"
                style={{ fontFamily: 'Syne, sans-serif' }}>
                <Phone size={16} /> Accept
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
