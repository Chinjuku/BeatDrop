'use client';
import React from 'react';

interface BeatDropLogoProps {
  className?: string;
  size?: number;
}

/**
 * BeatDrop Custom Dynamic Audio Brand Icon
 * Concept: Headphone arc + sound waves + vinyl groove + central audio drop/pulse
 */
export const BeatDropLogo: React.FC<BeatDropLogoProps> = ({
  className = 'w-6 h-6',
  size,
}) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: size } : undefined}
    >
      <defs>
        <linearGradient id="beatdrop-grad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--song-accent, #19df70)" />
          <stop offset="1" stopColor="var(--song-accent-text, #39e887)" />
        </linearGradient>
        <radialGradient id="beatdrop-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--song-accent, #19df70)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--song-accent, #19df70)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient Sound Halo Glow */}
      <circle cx="24" cy="24" r="22" fill="url(#beatdrop-glow)" />

      {/* Dynamic Sound Equalizer Waves (Left & Right) */}
      {/* Left Equalizer bars */}
      <rect x="7" y="20" width="2.5" height="8" rx="1.25" fill="currentColor" fillOpacity="0.8" />
      <rect x="12" y="16" width="2.5" height="16" rx="1.25" fill="currentColor" />
      <rect x="17" y="12" width="2.5" height="24" rx="1.25" fill="currentColor" />

      {/* Center "Drop" Pulse Pillar */}
      <rect x="22.5" y="8" width="3" height="32" rx="1.5" fill="url(#beatdrop-grad)" />

      {/* Right Equalizer bars */}
      <rect x="28.5" y="12" width="2.5" height="24" rx="1.25" fill="currentColor" />
      <rect x="33.5" y="16" width="2.5" height="16" rx="1.25" fill="currentColor" />
      <rect x="38.5" y="20" width="2.5" height="8" rx="1.25" fill="currentColor" fillOpacity="0.8" />

      {/* Headphone Soundwave Arc Top */}
      <path
        d="M10 24C10 16.268 16.268 10 24 10C31.732 10 38 16.268 38 24"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.4"
      />

      {/* Central Beat "Drop" Icon Badge */}
      <circle cx="24" cy="24" r="5" fill="var(--song-accent-on, #04160b)" stroke="url(#beatdrop-grad)" strokeWidth="2" />
      <polygon points="23,21.5 27,24 23,26.5" fill="var(--song-accent, #19df70)" />
    </svg>
  );
};

