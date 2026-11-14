'use client';
/** Live rooms, "everyone answers" mode: a toast that drops in from the top of the round card. */
import { useTranslations } from 'next-intl';
import { CORRECT_TOAST_FAST_MS, CORRECT_TOAST_MS, MAX_PENDING, useShownEntry, type CorrectEntry } from '../../hooks/useCorrectFeed';
import { playerColor } from '../../shared/roomColors';

export function CorrectToast({ entries, meId, roundIndex, colorIndexOf }: { entries: CorrectEntry[]; meId: string; roundIndex: number; colorIndexOf: (playerId: string) => number }) {
  const t = useTranslations('Room');
  const shown = useShownEntry(entries, CORRECT_TOAST_MS, roundIndex, { fastMs: CORRECT_TOAST_FAST_MS, maxPending: MAX_PENDING });
  if (!shown) return null;
  const entry = shown.entry;
  const isMe = entry ? entry.playerId === meId : false;
  const color = entry ? playerColor(colorIndexOf(entry.playerId), isMe) : 'var(--song-border)';
  const text = !entry
    ? t('game.gotItMore', { count: shown.more })
    : isMe
      ? t('game.gotItMe', { points: entry.points })
      : t('game.gotIt', { name: entry.name, points: entry.points });
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-2 z-10 flex min-w-0 justify-center px-3">
      <div
        key={entry ? `${entry.playerId}:${entry.at}` : 'more'}
        className="bd-toast flex min-w-0 max-w-full items-center gap-2 rounded-full border px-4 py-2 text-sm font-extrabold shadow-lg"
        style={{ ['--bd-dur' as string]: `${shown.durationMs}ms`, borderColor: color, backgroundColor: 'var(--song-surface)', color: 'var(--song-text)', boxShadow: `0 0 0 1px ${color}` }}
      >
        {entry && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
        <span className="truncate">{text}</span>
      </div>
    </div>
  );
}
