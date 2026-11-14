'use client';
/** Live rooms, buzzer mode: a big centre burst (ring with a tick for me, the initial for others). */
import { useTranslations } from 'next-intl';
import { CORRECT_BURST_MS, useShownEntry, type CorrectEntry } from '../../hooks/useCorrectFeed';
import { playerColor } from '../../shared/roomColors';

export function CorrectBurst({ entries, meId, roundIndex, colorIndexOf }: { entries: CorrectEntry[]; meId: string; roundIndex: number; colorIndexOf: (playerId: string) => number }) {
  const t = useTranslations('Room');
  const shown = useShownEntry(entries, CORRECT_BURST_MS, roundIndex);
  const entry = shown?.entry;
  if (!shown || !entry) return null;
  const isMe = entry.playerId === meId;
  const color = playerColor(colorIndexOf(entry.playerId), isMe);
  const initial = Array.from(entry.name.trim())[0]?.toUpperCase() ?? '?';
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div key={`${entry.playerId}:${entry.at}`} className="bd-burst flex max-w-[90%] flex-col items-center gap-3 rounded-3xl px-6 py-5" style={{ ['--bd-dur' as string]: `${shown.durationMs}ms`, backgroundColor: 'color-mix(in srgb, var(--song-surface) 88%, transparent)' }}>
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
