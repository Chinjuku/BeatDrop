import React from 'react';
import { Check, SkipForward, X } from 'lucide-react';

export type GuessStatus = 'correct' | 'wrong' | 'skipped' | 'expired' | 'pending' | 'unused';

const TONE: Record<GuessStatus, string> = {
  correct: '#22c55e',
  wrong: '#ef4444',
  expired: '#ef4444',
  skipped: '#f59e0b',
  pending: 'var(--song-border)',
  unused: 'var(--song-border)',
};

/** Icon for one guess attempt (history rows). Decorative: the row text carries the meaning. */
export function StatusMark({ status, className = 'w-3.5 h-3.5' }: { status: GuessStatus; className?: string }) {
  const Icon = status === 'correct' ? Check : status === 'skipped' ? SkipForward : X;
  return <Icon aria-hidden="true" className={`shrink-0 ${className}`} strokeWidth={3} style={{ color: TONE[status] }} />;
}

/** Row of small squares summarising each clip stage (on-screen version of the share grid). */
export function StageSquares({ statuses, label }: { statuses: GuessStatus[]; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-1">
      {statuses.map((status, idx) => (
        <span
          key={idx}
          className="block w-3.5 h-3.5 rounded-[4px]"
          style={{
            backgroundColor: status === 'pending' || status === 'unused' ? 'transparent' : TONE[status],
            border: `1.5px solid ${TONE[status]}`,
          }}
        />
      ))}
    </span>
  );
}
