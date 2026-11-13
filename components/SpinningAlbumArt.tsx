'use client';
import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Pause,
  Play,
  SkipForward,
  Ticket,
  Volume2,
  VolumeX,
  Disc3,
} from 'lucide-react';
import {
  DifficultyLevel,
  GuessHistoryItem,
  Song,
} from '../types';
import { AudioPlaybackState } from '../hooks/useAudioController';
import { useTranslations } from 'next-intl';
import { useAudioProgress } from '../context/GameContext';
import { copyToClipboard, shareOrCopy } from '../lib/shareUtils';

interface SpinningAlbumArtProps {
  song: Song;
  outcome: 'correct' | 'failed';
  guessedAtSeconds: number;
  difficulty: DifficultyLevel;
  stages: number[];
  history: GuessHistoryItem[];
  streak: number;
  audioState: AudioPlaybackState;
  currentTime: number;
  totalDuration: number;
  onToggleFullPlay: () => void;
  onSeek: (seconds: number) => void;
  volume: number;
  onVolumeChange: (val: number) => void;
  onNextSong: () => void;
  onOpenTicket?: () => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

export const SpinningAlbumArt: React.FC<SpinningAlbumArtProps> = ({
  song,
  outcome,
  guessedAtSeconds,
  difficulty,
  stages,
  history,
  streak,
  audioState,
  currentTime: propCurrentTime,
  totalDuration: propTotalDuration,
  onToggleFullPlay,
  onSeek,
  volume,
  onVolumeChange,
  onNextSong,
  onOpenTicket,
}) => {
  const t = useTranslations('Reveal');
  const tc = useTranslations('Common');
  const audioProgress = useAudioProgress();
  const currentTime = audioProgress ? audioProgress.currentTime : propCurrentTime;
  const totalDuration = audioProgress ? audioProgress.totalDuration : propTotalDuration;
  const [copied, setCopied] = useState(false);
  const isPlaying = audioState === 'playing';
  const isWon = outcome === 'correct';
  const nextSongRef = useRef<HTMLButtonElement>(null);

  // Bring the primary action into view (and focus it, so Enter continues) when the
  // reveal appears; otherwise "next song" can sit below the fold on short screens.
  useEffect(() => {
    const button = nextSongRef.current;
    if (!button) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [song.id]);

  // Build Emoji Summary Grid (🟩 / 🟨 / 🟥 / ⬜)
  const emojiBoxes = stages.map((_, idx) => {
    const item = history.find((h) => h.stageIndex === idx);
    if (!item) return '⬜';
    if (item.status === 'correct') return '🟩';
    if (item.status === 'skipped') return '🟨';
    return '🟥';
  });

  const handleCopyShare = async () => {
    const grid = emojiBoxes.join('');
    const resultLine = isWon
      ? t('share.wonLine', { seconds: guessedAtSeconds, difficulty: difficulty.toUpperCase() })
      : t('share.lostLine', { difficulty: difficulty.toUpperCase() });
    const shareText = [
      `🎧 BeatDrop • ${song.category === 'thai' ? `🇹🇭 ${tc('category.thai')}` : `🌍 ${tc('category.international')}`}`,
      `${grid}`,
      `${resultLine} | 🔥 Streak: ${streak}`,
      `🎵 ${t('share.songLine', { title: song.title, artist: song.artistName, year: String(song.releaseYear) })}`,
      `https://beatdrop.app #beatdrop`,
    ].join('\n');

    const result = await shareOrCopy({
      title: t('share.title'),
      text: shareText,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });
    if (result === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const progressPct =
    totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  return (
    <section
      className="w-full flex flex-col items-center text-center pt-2 pb-1 animate-fadeIn"
      data-outcome={outcome}
      aria-live="polite"
    >
      {/* Rotating Vinyl Record + Album Art Centerpiece */}
      <div className="relative flex items-center justify-center my-3">
        {/* Outer Glow when playing */}
        <div
          className="absolute inset-0 rounded-full blur-2xl transition-opacity duration-500 pointer-events-none"
          style={{
            backgroundColor: isWon ? 'var(--song-accent)' : '#ff746d',
            opacity: isPlaying ? 0.28 : 0.1,
          }}
        />

        {/* Vinyl Record Disc (360-deg continuous spin, pauses when audio pauses) */}
        <div
          onClick={onToggleFullPlay}
          title={isPlaying ? t('vinylPause') : t('vinylResume')}
          className={`reveal-vinyl relative w-44 h-44 sm:w-56 md:w-60 sm:h-56 md:h-60 rounded-full shadow-2xl cursor-pointer flex items-center justify-center border-4 border-black/80 vinyl-grooves vinyl-record-spin ${
            isPlaying ? '' : 'is-paused'
          }`}
        >
          {/* Vinyl Shine Highlight */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 45%, transparent 55%, rgba(255,255,255,0.08) 100%)',
            }}
          />

          {/* Album Cover Art (Large Vinyl Center Label) */}
          <div className="reveal-vinyl-label relative w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden border-4 border-neutral-900 shadow-inner">
            <img
              src={song.artworkUrl}
              alt={t('albumArtAlt', { title: song.title })}
              className="w-full h-full object-cover"
            />
            {/* Vinyl Center Spindle Hole */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="w-4 h-4 rounded-full border-2 border-white/40 shadow-inner"
                style={{ backgroundColor: 'var(--song-stage)' }}
              />
            </div>
          </div>
        </div>

        {/* Tonearm / Playing Badge */}
        <div
          className="absolute -bottom-2 right-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-lg border"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
            color: isPlaying ? 'var(--song-accent-text)' : 'var(--song-muted)',
          }}
        >
          <Disc3 className={`w-3.5 h-3.5 ${isPlaying ? 'animate-spin' : ''}`} />
          <span>{isPlaying ? t('playingFull') : t('paused')}</span>
        </div>
      </div>

      {/* Kicker & Title with Songspot Stamp */}
      <span
        className="text-[11px] font-mono font-extrabold uppercase tracking-[0.18em] mt-4"
        style={{ color: isWon ? 'var(--song-accent-text)' : '#ff746d' }}
      >
        {isWon ? t('guessedIn', { seconds: guessedAtSeconds }) : t('theSongWas')}
      </span>

      <div className="relative inline-block max-w-full px-6 mt-1.5">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight break-words">
          {song.title}
        </h2>
        <strong
          className="songspot-reveal-stamp hidden sm:inline-block"
          style={{
            color: isWon ? 'var(--song-accent-text)' : '#ff746d',
            position: 'absolute',
            top: '50%',
            right: '-58px',
          }}
        >
          {isWon ? t('stampWon') : t('stampLost')}
        </strong>
      </div>

      {/* Full Metadata Badges */}
      <p className="text-sm sm:text-base font-bold mt-1" style={{ color: 'var(--song-text)' }}>
        {song.artistName}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 mt-2.5 text-xs font-semibold">
        <span
          className="px-2.5 py-1 rounded-lg border"
          style={{
            backgroundColor: 'var(--song-surface-soft)',
            borderColor: 'var(--song-border)',
            color: 'var(--song-muted)',
          }}
        >
          💿 {t('album')} <strong style={{ color: 'var(--song-text)' }}>{song.albumName}</strong>
        </span>
        <span
          className="px-2.5 py-1 rounded-lg border"
          style={{
            backgroundColor: 'var(--song-surface-soft)',
            borderColor: 'var(--song-border)',
            color: 'var(--song-muted)',
          }}
        >
          📅 {t('released')} <strong style={{ color: 'var(--song-text)' }}>{song.releaseYear}</strong>
        </span>
        <span
          className="px-2.5 py-1 rounded-lg border"
          style={{
            backgroundColor: 'var(--song-surface-soft)',
            borderColor: 'var(--song-border)',
            color: 'var(--song-muted)',
          }}
        >
          🎸 {t('genre')} <strong style={{ color: 'var(--song-text)' }}>{song.genre}</strong>
        </span>
      </div>

      {/* 30-Second Interactive Audio Player & Seek Bar */}
      <div
        className="w-full mt-5 p-4 rounded-2xl border space-y-2.5"
        style={{
          backgroundColor: 'var(--song-surface-soft)',
          borderColor: 'var(--song-border)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleFullPlay}
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition hover:scale-105"
            style={{
              backgroundColor: 'var(--song-accent)',
              color: 'var(--song-accent-on)',
            }}
            aria-label={isPlaying ? t('pausePreview') : t('playPreview')}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current translate-x-0.5" />
            )}
          </button>

          <div className="flex-1 flex flex-col">
            <input
              type="range"
              min={0}
              max={totalDuration || 30}
              step={0.1}
              value={currentTime}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="songspot-slider"
              style={{ '--fill': `${progressPct}%` } as React.CSSProperties}
              aria-label={t('seekPreview')}
            />
            <div
              className="flex justify-between text-[11px] font-mono font-bold mt-0.5"
              style={{ color: 'var(--song-muted)' }}
            >
              <span style={{ color: 'var(--song-accent-text)' }}>
                {formatTime(currentTime)}
              </span>
              <span>{t('fullPreview', { time: formatTime(totalDuration || 30) })}</span>
            </div>
          </div>

          {/* Compact Volume Control */}
          <div className="hidden sm:flex items-center gap-2 w-28">
            <button
              type="button"
              onClick={() => onVolumeChange(volume > 0 ? 0 : 80)}
              style={{ color: 'var(--song-muted)' }}
              aria-label={t('toggleMute')}
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
              aria-label={t('volume')}
            />
          </div>
        </div>
      </div>

      {/* Emoji Result Summary Grid & Share / Next Actions */}
      <div className="w-full mt-4 flex flex-col items-center">
        <div className="flex items-center gap-2 text-lg mb-3" title={t('attemptSummary')}>
          <span>{emojiBoxes.join(' ')}</span>
          {song.trackViewUrl && (
            <a
              href={song.trackViewUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-2 text-xs font-bold inline-flex items-center gap-1 underline underline-offset-4"
              style={{ color: 'var(--song-muted)' }}
            >
              <span>Apple Music</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onOpenTicket || handleCopyShare}
            className="py-3.5 px-4 rounded-2xl border font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:brightness-110 shadow-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--song-accent) 18%, var(--song-surface))',
              borderColor: 'var(--song-accent)',
              color: 'var(--song-accent-text)',
            }}
          >
            <Ticket className="w-4 h-4" />
            <span>{t('shareCard')}</span>
          </button>

          <button
            ref={nextSongRef}
            type="button"
            onClick={onNextSong}
            className="order-first sm:order-last min-h-[44px] py-3.5 px-5 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:brightness-110 shadow-lg"
            style={{
              backgroundColor: 'var(--song-accent)',
              color: 'var(--song-accent-on)',
            }}
          >
            <span>{t('nextSong')}</span>
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopyShare}
          className="mt-2 text-xs font-semibold underline underline-offset-4 flex items-center gap-1.5 opacity-70 hover:opacity-100 transition"
          style={{ color: 'var(--song-muted)' }}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? t('copied') : t('copyText')}</span>
        </button>
      </div>
    </section>
  );
};

