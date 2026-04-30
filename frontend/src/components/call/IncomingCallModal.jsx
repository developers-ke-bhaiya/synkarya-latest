import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useOnlineStore } from '../../store/onlineStore';
import { useDirectCall } from '../../hooks/useDirectCall';
import { Avatar } from '../ui/Avatar';

export const IncomingCallModal = () => {
  const { incomingCall } = useOnlineStore();
  const { acceptCall, rejectCall } = useDirectCall();
  const autoRejectRef = useRef(null);

  // Auto-reject after 45s if not answered
  useEffect(() => {
    if (!incomingCall) return;
    autoRejectRef.current = setTimeout(() => {
      rejectCall(incomingCall.fromUid);
    }, 45000);
    return () => clearTimeout(autoRejectRef.current);
  }, [incomingCall]);

  if (!incomingCall) return null;

  const { fromUid, fromDisplayName, fromAvatar } = incomingCall;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm animate-scale-in">
        {/* Glow backdrop */}
        <div className="absolute inset-0 rounded-3xl blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.5) 0%, transparent 70%)', transform: 'scale(0.8)' }}
        />

        <div
          className="relative rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid rgba(16,185,129,0.3)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(16,185,129,0.1)',
          }}
        >
          {/* Green top bar */}
          <div className="h-0.5 w-full bg-gradient-to-r from-emerald-400 to-teal-400" />

          <div className="p-5">
            <div className="flex items-center gap-4">
              {/* Pulsing avatar */}
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 rounded-full bg-emerald-400/15 animate-ping" />
                <div className="absolute inset-0 rounded-full bg-emerald-400/8 animate-ping" style={{ animationDelay: '0.5s' }} />
                <Avatar name={fromDisplayName} size="lg" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Video size={11} className="text-emerald-400" />
                  <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest" style={{ fontFamily: 'Syne, sans-serif' }}>
                    Incoming call
                  </p>
                </div>
                <p className="text-white font-bold text-lg truncate" style={{ fontFamily: 'Syne, sans-serif' }}>
                  {fromDisplayName}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Wants to video call with you</p>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => rejectCall(fromUid)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all duration-200"
                style={{
                  background: 'var(--danger-dim)',
                  color: 'var(--danger)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  fontFamily: 'Syne, sans-serif',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--danger-dim)'; e.currentTarget.style.color = 'var(--danger)'; }}
              >
                <PhoneOff size={16} /> Decline
              </button>
              <button
                onClick={() => acceptCall(fromUid, fromDisplayName, fromAvatar)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200"
                style={{
                  background: 'var(--success)',
                  boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
                  fontFamily: 'Syne, sans-serif',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#34d399'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(16,185,129,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--success)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(16,185,129,0.4)'; }}
              >
                <Phone size={16} /> Accept
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
