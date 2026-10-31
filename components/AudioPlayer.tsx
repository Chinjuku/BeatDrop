'use client';
import React from 'react';
import { Play, Square, Volume2, VolumeX } from 'lucide-react';
import { AudioPlaybackState } from '../hooks/useAudioController';

interface AudioPlayerProps {
  stages: number[];
  currentStage: number;
  audioState: AudioPlaybackState;
  progress: number; // 0..1 within current snippet
  onTogglePlay: () => void;
  volume: number;
  onVolumeChange: (val: number) => void;
  disabled?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  stages,
  currentStage,
  audioState,
  progress,
  onTogglePlay,
  volume,
  onVolumeChange,
  disabled,
}) => {
  const maxSeconds = stages[stages.length - 1] || 15;
  const activeSeconds = stages[currentStage] || stages[0] || 1;

  // Calculate relative flex weights for each stage segment (Songspot timeline style)
  const segments = stages.map((sec, idx) => {
    const prevSec = idx === 0 ? 0 : stages[idx - 1];
    const delta = Math.max(0.1, sec - prevSec);
    return {
      index: idx,
      seconds: sec,
      weight: delta,
    };
  });

  // Calculate exact unlocked width ratio based on sum of segment weights
  const totalWeight = segments.reduce((sum, s) => sum + s.weight, 0);
  const unlockedWeight = segments
    .slice(0, currentStage + 1)
    .reduce((sum, s) => sum + s.weight, 0);
  const unlockedRatio = totalWeight > 0 ? unlockedWeight / totalWeight : 1;

  // Exact scale stopping cleanly at the active stage border
  const overallPlaybackScale =
    audioState === 'playing'
      ? Math.min(unlockedRatio, progress * unlockedRatio)
      : 0;

  return (
    <div className="w-full flex flex-col items-center">
      {/* Stage Pills Indicator */}
      <div
        className="w-full grid gap-1 sm:gap-2 mb-3"
        style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
      >
        {stages.map((sec, idx) => {
          const isCurrent = idx === currentStage;
          const isUnlocked = idx <= currentStage;
          return (
            <div
              key={`stage-${idx}-${sec}`}
              className="py-1 sm:py-1.5 px-1 sm:px-2 rounded-lg sm:rounded-xl border text-center transition-all min-w-0 overflow-hidden"
              style={
                isCurrent
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--song-accent) 22%, var(--song-surface))',
                      borderColor: 'var(--song-accent)',
                      color: 'var(--song-accent-text)',
                      boxShadow: '0 0 14px color-mix(in srgb, var(--song-accent) 35%, transparent)',
                    }
                  : isUnlocked
                    ? {
                        backgroundColor: 'var(--song-surface-soft)',
                        borderColor: 'var(--song-border)',
                        color: 'var(--song-text)',
                      }
                    : {
                        backgroundColor: 'var(--song-surface)',
                        borderColor: 'var(--song-border)',
                        color: 'var(--song-muted)',
                        opacity: 0.6,
                      }
              }
            >
              <div className="text-[9px] sm:text-[10px] font-semibold uppercase truncate">ขั้นที่ {idx + 1}</div>
              <div className="text-[11px] sm:text-sm font-extrabold font-mono truncate">{sec}s</div>
            </div>
          );
        })}
      </div>

      {/* Songspot Segmented Progress Track */}
      <div className="w-full relative mb-5">
        <div
          className="songspot-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={activeSeconds}
          aria-valuenow={Math.round(progress * activeSeconds * 10) / 10}
        >
          {segments.map((seg) => (
            <span
              key={seg.index}
              className={
                seg.index <= currentStage
                  ? 'songspot-progress-segment is-active'
                  : 'songspot-progress-segment'
              }
              style={{ flex: `${seg.weight} ${seg.weight} 0%` }}
            />
          ))}
          <span
            className="songspot-playback-progress"
            aria-hidden="true"
            style={{
              width: `${Math.min(100, Math.max(0, overallPlaybackScale * 100))}%`,
            }}
          />
        </div>

        <div className="flex justify-between items-center mt-1.5 px-1 text-[11px] font-mono font-bold">
          <span style={{ color: 'var(--song-accent-text)' }}>
            {audioState === 'playing'
              ? `${(progress * activeSeconds).toFixed(1)}s / ${activeSeconds}s`
              : `ปลดล็อกแล้ว: ${activeSeconds}s`}
          </span>
          <span style={{ color: 'var(--song-muted)' }}>สูงสุด {maxSeconds}s</span>
        </div>
      </div>

      {/* Big Circular Play Button (Extracted Songspot .songspot-play-key) */}
      <div className="my-2 flex flex-col items-center relative">
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={disabled || audioState === 'loading'}
          data-audio-state={audioState === 'playing' ? 'playing' : 'ready'}
          className="songspot-play-key"
          aria-label={audioState === 'playing' ? 'Stop snippet' : `Play ${activeSeconds} second snippet`}
        >
          <span className="songspot-play-ripple" aria-hidden="true" />
          {audioState === 'loading' ? (
            <div
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-3 sm:border-4 border-current border-t-transparent animate-spin"
              aria-label="Loading audio"
            />
          ) : audioState === 'playing' ? (
            <Square className="w-8 h-8 sm:w-11 sm:h-11 fill-current" />
          ) : (
            <Play className="w-9 h-9 sm:w-12 sm:h-12 fill-current translate-x-0.5 sm:translate-x-1" />
          )}
        </button>

        <div className="mt-3 text-center">
          <span
            className="text-xs font-bold tracking-wide"
            style={{ color: 'var(--song-accent-text)' }}
          >
            {audioState === 'loading'
              ? 'กำลังโหลดเสียงเพลง...'
              : audioState === 'playing'
                ? `กำลังเล่นตัวอย่าง ${activeSeconds} วินาที...`
                : `กดปุ่ม หรือกด [Space] เพื่อฟัง ${activeSeconds} วินาที`}
          </span>
        </div>
      </div>

      {/* Volume Bar */}
      <div className="w-full max-w-xs flex items-center gap-3 mt-3 px-3 py-1.5 rounded-xl border" style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}>
        <button
          type="button"
          onClick={() => onVolumeChange(volume > 0 ? 0 : 80)}
          className="text-xs"
          style={{ color: 'var(--song-muted)' }}
          aria-label="Toggle Mute"
        >
          {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="songspot-slider"
          style={{ '--fill': `${volume}%` } as React.CSSProperties}
          aria-label="Volume"
        />
        <span className="text-[11px] font-mono font-bold w-8 text-right" style={{ color: 'var(--song-muted)' }}>
          {volume}%
        </span>
      </div>
    </div>
  );
};

