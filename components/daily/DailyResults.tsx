'use client';
/**
 * Shared Daily result UI, used by today's Daily Challenge and the Daily archive so both
 * pages show progress, the finished summary and the revealed songs the same way.
 */
import React from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Trophy } from 'lucide-react';
import type { DailyRevealSong } from '../../shared/types';
import { appleMusicUrl, spotifySearchUrl } from '../../lib/songHistory';

export type DailyRoundResult = 'correct' | 'wrong' | 'skipped' | 'expired' | 'pending';

const DOT_STYLE: Record<DailyRoundResult, React.CSSProperties> = {
  correct: { backgroundColor: '#22c55e', borderColor: '#22c55e', color: '#ffffff' },
  wrong: { backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#ffffff' },
  expired: { backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#ffffff' },
  skipped: { backgroundColor: '#f59e0b', borderColor: '#f59e0b', color: '#111827' },
  pending: { backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)', color: 'var(--song-muted)' },
};

const DOT_MARK: Record<DailyRoundResult, string> = { correct: '✓', wrong: '✕', expired: '✕', skipped: '−', pending: '' };

/** One circle per song: ✓ / ✕ / − once played, the song number while pending. */
export function DailyResultDots({
  results,
  activeIndex,
  size = 'sm',
}: {
  results: DailyRoundResult[];
  activeIndex?: number;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('Daily.songList');
  const box = size === 'md' ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs';
  const label = results.map((r, i) => `${i + 1}: ${t(`result.${r}`)}`).join(', ');
  return (
    <div role="img" aria-label={label} className="flex items-center gap-1.5">
      {results.map((res, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`${box} rounded-full flex items-center justify-center font-bold border transition-all ${
            i === activeIndex ? 'ring-2 ring-[var(--song-accent)] ring-offset-2 ring-offset-[var(--song-surface)]' : ''
          }`}
          style={DOT_STYLE[res]}
        >
          {DOT_MARK[res] || i + 1}
        </span>
      ))}
    </div>
  );
}

export interface DailySongRow {
  song: DailyRevealSong | null;
  result: DailyRoundResult;
  /** Points for this song when known (the archive tracks them; today's Daily shows the total only). */
  points?: number;
}

const RESULT_COLOR: Record<DailyRoundResult, string> = {
  correct: '#22c55e',
  wrong: '#f87171',
  expired: '#f87171',
  skipped: '#fbbf24',
  pending: 'var(--song-muted)',
};

/** The revealed songs, one row each, with Apple Music and Spotify links. */
export function DailySongList({ rows }: { rows: DailySongRow[] }) {
  const t = useTranslations('Daily.songList');
  const linkClass =
    'inline-flex items-center gap-1 rounded-md px-1 -mx-1 py-1 underline underline-offset-4 hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--song-accent)]';
  return (
    <section className="w-full text-left" aria-labelledby="daily-song-list-heading">
      <h3
        id="daily-song-list-heading"
        className="text-[11px] font-black uppercase tracking-wider mb-2 px-1"
        style={{ color: 'var(--song-muted)' }}
      >
        {t('heading', { total: rows.length })}
      </h3>
      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <li
            key={row.song?.id ?? `pending-${i}`}
            className="flex items-center gap-3 rounded-xl border p-2 pr-3"
            style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
          >
            <span className="w-5 text-center text-sm font-black tabular-nums shrink-0" style={{ color: 'var(--song-muted)' }}>
              {i + 1}
            </span>
            {row.song?.artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.song.artworkUrl}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                className="w-12 h-12 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span className="w-12 h-12 rounded-lg shrink-0" style={{ backgroundColor: 'var(--song-border)' }} aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              {row.song ? (
                <>
                  <p className="text-sm font-extrabold truncate" style={{ color: 'var(--song-text)' }}>{row.song.title}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--song-muted)' }}>{row.song.artistName}</p>
                  <div className="flex flex-wrap items-center gap-x-3 text-[11px] font-bold" style={{ color: 'var(--song-muted)' }}>
                    <a href={appleMusicUrl(row.song.title, row.song.artistName, row.song.trackViewUrl)} target="_blank" rel="noreferrer" className={linkClass}>
                      Apple Music <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                    <a href={spotifySearchUrl(row.song.title, row.song.artistName)} target="_blank" rel="noreferrer" className={linkClass}>
                      Spotify <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-sm font-bold" style={{ color: 'var(--song-muted)' }}>{t('notRevealed')}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-extrabold" style={{ color: RESULT_COLOR[row.result] }}>{t(`result.${row.result}`)}</p>
              {typeof row.points === 'number' && (
                <p className="text-sm font-black tabular-nums" style={{ color: row.points ? '#22c55e' : 'var(--song-muted)' }}>
                  {row.points ? t('points', { points: row.points }) : '0'}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Finished-run summary: trophy, score, per-song dots, the revealed songs, then actions. */
export function DailyFinishedCard({
  kicker,
  heading,
  subheading,
  scoreLabel,
  breakdown,
  rows,
  children,
}: {
  kicker: string;
  heading: string;
  subheading?: string;
  scoreLabel: string;
  breakdown?: string;
  rows: DailySongRow[];
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 sm:py-6 flex flex-col items-center text-center animate-in fade-in duration-300">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 border shadow-lg"
        style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 22%, transparent)', borderColor: '#f59e0b', color: '#fbbf24' }}
        aria-hidden="true"
      >
        <Trophy className="w-7 h-7" />
      </div>
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-400 mb-1">{kicker}</p>
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{heading}</h2>
      {subheading && <p className="text-xs mt-1" style={{ color: 'var(--song-muted)' }}>{subheading}</p>}
      <p className="text-4xl font-black font-mono my-3" style={{ color: 'var(--song-accent-text)' }}>{scoreLabel}</p>
      {breakdown && <p className="text-xs mb-3" style={{ color: 'var(--song-muted)' }}>{breakdown}</p>}
      <div className="mb-5">
        <DailyResultDots results={rows.map((r) => r.result)} size="md" />
      </div>
      <div className="w-full mb-5">
        <DailySongList rows={rows} />
      </div>
      <div className="w-full max-w-sm flex flex-col gap-2.5">{children}</div>
    </div>
  );
}
