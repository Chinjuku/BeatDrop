import React from 'react';
import { BeatDropLogo } from '../components/BeatDropLogo';

export default function Loading() {
  return (
    <div className="w-full min-h-[60vh] flex flex-col items-center justify-center p-6 space-y-4 animate-in fade-in duration-300">
      <div className="relative flex items-center justify-center">
        {/* Ambient Pulsing Glow */}
        <div className="absolute w-20 h-20 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
        
        {/* Logo with Smooth Spin/Scale */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center p-2.5 border shadow-xl relative z-10 transition-transform"
          style={{
            backgroundColor: 'var(--song-surface, #121c15)',
            borderColor: 'var(--song-accent, #00d674)',
            color: 'var(--song-accent-text, #00d674)',
          }}
        >
          <BeatDropLogo className="w-8 h-8 animate-pulse text-emerald-400" />
        </div>
      </div>

      <div className="text-center space-y-1 z-10">
        <div className="text-sm font-extrabold tracking-wider bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
          BeatDrop
        </div>
        <div
          className="text-xs font-bold uppercase tracking-widest opacity-60"
          style={{ color: 'var(--song-muted, #7c8e7e)' }}
        >
          กำลังโหลด...
        </div>
      </div>
    </div>
  );
}

