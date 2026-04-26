import React from 'react';
import { Video, MessageSquare, Users, ArrowLeft } from 'lucide-react';

export const EmptyState = () => (
  <div className="flex-1 flex items-center justify-center flex-col gap-6 p-8">
    {/* Glowing ring */}
    <div className="relative">
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-400/20 to-violet-500/20
        flex items-center justify-center border border-amber-400/20">
        <Video size={36} className="text-amber-400/60" />
      </div>
      <div className="absolute inset-0 rounded-3xl bg-amber-400/10 blur-xl" />
    </div>

    <div className="text-center max-w-xs">
      <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>
        Ready when you are
      </h2>
      <p className="text-sm text-slate-500 leading-relaxed">
        Select a room from the sidebar or create a new one to start a video call.
      </p>
    </div>

    <div className="flex flex-col gap-3 w-full max-w-xs">
      {[
        { icon: <Video size={14} />, text: 'HD video & audio calling' },
        { icon: <MessageSquare size={14} />, text: 'Real-time group chat' },
        { icon: <Users size={14} />, text: 'Attendance tracking' },
      ].map(({ icon, text }) => (
        <div key={text}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <span className="text-amber-400">{icon}</span>
          <span className="text-sm text-slate-400">{text}</span>
        </div>
      ))}
    </div>

    <div className="flex items-center gap-2 text-xs text-slate-600">
      <ArrowLeft size={12} />
      <span>Pick a room from the sidebar to get started</span>
    </div>
  </div>
);
