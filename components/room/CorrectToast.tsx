'use client';
/** Live rooms, "everyone answers" mode: a toast that drops in from the top of the round card. */
import { useTranslations } from 'next-intl';
import { useShownEntry, type CorrectEntry } from '../../hooks/useCorrectFeed';
import { playerColor } from '../../shared/roomColors';

export const TOAST_MS = 2000;

export function CorrectToast({ entries, meId, colorIndexOf }: { entries: CorrectEntry[]; meId: string; colorIndexOf: (playerId: string) => number }) {
  const t = useTranslations('Room');
  const entry = useShownEntry(entries, TOAST_MS);
  if (!entry) return null;
  const isMe = entry.playerId === meId;
  const color = playerColor(colorIndexOf(entry.playerId), isMe);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-3">
      <div
        key={`${entry.playerId}:${entry.at}`}
        className="bd-toast flex max-w-full items-center gap-2 rounded-full border px-4 py-2 text-sm font-extrabold shadow-lg"
        style={{ borderColor: color, backgroundColor: 'var(--song-surface)', color: 'var(--song-text)', boxShadow: `0 0 0 1px ${color}` }}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">
          {isMe ? t('game.gotItMe', { points: entry.points }) : t('game.gotIt', { name: entry.name, points: entry.points })}
        </span>
      </div>
    </div>
  );
}
