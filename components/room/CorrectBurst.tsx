'use client';
/** Live rooms, buzzer mode: a big centre burst (ring with a tick for me, the initial for others). */
import { useTranslations } from 'next-intl';
import { useShownEntry, type CorrectEntry } from '../../hooks/useCorrectFeed';
import { playerColor } from '../../shared/roomColors';

export const BURST_MS = 1500;

export function CorrectBurst({ entries, meId, colorIndexOf }: { entries: CorrectEntry[]; meId: string; colorIndexOf: (playerId: string) => number }) {
  const t = useTranslations('Room');
  const entry = useShownEntry(entries, BURST_MS);
  if (!entry) return null;
  const isMe = entry.playerId === meId;
  const color = playerColor(colorIndexOf(entry.playerId), isMe);
  const initial = Array.from(entry.name.trim())[0]?.toUpperCase() ?? '?';
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div key={`${entry.playerId}:${entry.at}`} className="bd-burst flex max-w-[90%] flex-col items-center gap-3 rounded-3xl px-6 py-5" style={{ backgroundColor: 'color-mix(in srgb, var(--song-surface) 88%, transparent)' }}>
        <span
          className="flex h-24 w-24 items-center justify-center rounded-full border-[6px] text-5xl font-black"
          style={{ borderColor: color, color, boxShadow: `0 0 32px ${color}` }}
        >
          {isMe ? '✓' : initial}
        </span>
        <span className="text-center text-lg font-extrabold" style={{ color: 'var(--song-text)' }}>
          {isMe ? t('game.gotItMe', { points: entry.points }) : t('game.gotIt', { name: entry.name, points: entry.points })}
        </span>
      </div>
    </div>
  );
}
