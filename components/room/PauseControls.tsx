'use client';
/**
 * Live rooms: pause UI. The server owns every rule (who may pause, cooldowns, the 60 s budget,
 * the 3 s resuming countdown); these components only render `RoomView` and send pause actions.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Coffee, Pause, Play } from 'lucide-react';
import { Modal } from '../Modal';
import { ROOM_LIMITS, type PauseAction, type RoomView } from '../../shared/roomTypes';

type PauseFn = (action: PauseAction) => Promise<{ ok: boolean; reason?: string }>;

const secondsUntil = (target: number, now: number) => Math.max(0, Math.ceil((target - now) / 1000));

const HINT_MS = 4000;
/** 409 reasons worth explaining to the player; anything else gets the generic hint. */
const HINT_KEYS = { cooldown: 'cooldown', pending: 'pending', 'buzz-hold': 'buzzHold' } as const;
type HintKey = (typeof HINT_KEYS)[keyof typeof HINT_KEYS] | 'generic';

const hintFor = (reason?: string): HintKey =>
  reason && reason in HINT_KEYS ? HINT_KEYS[reason as keyof typeof HINT_KEYS] : 'generic';

/** A short-lived hint after a refused pause action. Cleared on unmount. */
function useHint() {
  const [hint, setHint] = useState<HintKey | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = (key: HintKey | null) => {
    window.clearTimeout(timer.current);
    setHint(key);
    if (key) timer.current = window.setTimeout(() => setHint(null), HINT_MS);
  };
  return [hint, show] as const;
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--song-accent)]';

/** Host: "Pause". Everyone else: "Ask for a break", plus the status of their own request. */
export function PauseButton({ view, busy, onPause }: { view: RoomView; busy: boolean; onPause: PauseFn }) {
  const t = useTranslations('Room.pause');
  const [hint, setHint] = useHint();
  const isHost = view.me.isHost;
  const buzzHold = Boolean(view.buzz?.holderId);
  const pending = view.myPauseRequest === 'pending';
  const disabled = busy || buzzHold || Boolean(view.pause) || (!isHost && pending);

  const click = async () => {
    const { ok, reason } = await onPause(isHost ? 'pause' : 'request');
    setHint(ok ? null : hintFor(reason));
  };

  const status = view.myPauseRequest ? t(`status.${view.myPauseRequest}`) : null;
  const message = hint ? t(`hint.${hint}`) : buzzHold ? t('hint.buzzHold') : status;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => void click()}
        disabled={disabled}
        aria-describedby={message ? 'room-pause-status' : undefined}
        className={`min-h-11 rounded-xl border px-4 text-sm font-bold transition hover:brightness-110 disabled:opacity-50 ${focusRing}`}
        style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)', color: 'var(--song-text)' }}
      >
        <span className="flex items-center gap-2">
          {isHost ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Coffee className="w-4 h-4" aria-hidden="true" />}
          {isHost ? t('pause') : t('ask')}
        </span>
      </button>
      <p id="room-pause-status" role="status" aria-live="polite" className="text-xs font-bold text-center min-h-4" style={{ color: 'var(--song-muted)' }}>
        {message}
      </p>
    </div>
  );
}

/** Host only: answer a player's break request before it expires (10 s). */
export function PauseRequestDialog({
  request,
  now,
  busy,
  onPause,
}: {
  request: RoomView['pauseRequest'];
  now: number;
  busy: boolean;
  onPause: PauseFn;
}) {
  const t = useTranslations('Room.pause');
  const [hint, setHint] = useHint();
  // Keep the last request's name while the dialog closes, so the text does not blank out.
  const lastName = useRef('');
  if (request) lastName.current = request.playerName;

  const answer = async (action: 'approve' | 'decline') => {
    const { ok, reason } = await onPause(action);
    setHint(ok ? null : hintFor(reason));
  };

  const left = request ? Math.max(0, request.expiresAt - now) : 0;
  const fraction = Math.min(1, left / ROOM_LIMITS.pauseRequestMs);
  const title = t('dialog.title', { name: lastName.current });

  return (
    <Modal
      open={Boolean(request)}
      // Escape / swipe-down counts as "Not now".
      onClose={() => { if (!busy) void answer('decline'); }}
      title={title}
      dismissOnBackdrop={false}
      panelClassName="!w-[calc(100vw-24px)] sm:!max-w-sm !p-5 sm:!p-6"
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <Coffee className="w-5 h-5" aria-hidden="true" /> {title}
        </h2>
        <div>
          <div
            className="h-1.5 w-full rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--modal-elevated)' }}
            role="progressbar"
            aria-label={t('dialog.expires', { seconds: Math.ceil(left / 1000) })}
            aria-valuemin={0}
            aria-valuemax={ROOM_LIMITS.pauseRequestMs / 1000}
            aria-valuenow={Math.ceil(left / 1000)}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${fraction * 100}%`, backgroundColor: 'var(--modal-accent)', transition: 'width 0.2s linear' }}
            />
          </div>
          <p className="mt-1.5 text-xs font-bold tabular-nums" style={{ color: 'var(--modal-muted)' }}>
            {t('dialog.expires', { seconds: Math.ceil(left / 1000) })}
          </p>
        </div>
        {hint && <p role="status" className="text-xs font-bold" style={{ color: '#fbbf24' }}>{t(`hint.${hint}`)}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void answer('decline')}
            disabled={busy}
            className="min-h-11 rounded-xl border px-4 text-sm font-bold disabled:opacity-50"
            style={{ backgroundColor: 'var(--modal-elevated)', borderColor: 'var(--modal-border)' }}
          >
            {t('dialog.notNow')}
          </button>
          <button
            type="button"
            data-autofocus
            onClick={() => void answer('approve')}
            disabled={busy}
            className="min-h-11 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
            style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
          >
            {t('dialog.allow')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Covers the round card while paused: "Paused by {name}" with the time left, then
 * "Resuming in {n}" for the final countdown. The host can end the break early.
 * Place inside a `relative` container.
 */
export function PausedOverlay({
  pause,
  now,
  isHost,
  busy,
  onPause,
}: {
  pause: NonNullable<RoomView['pause']>;
  now: number;
  isHost: boolean;
  busy: boolean;
  onPause: PauseFn;
}) {
  const t = useTranslations('Room.pause');
  const ref = useRef<HTMLDivElement>(null);
  const resuming = now >= pause.resumingAt;

  // Focus inside the covered card (e.g. the guess field) would be lost: move it here.
  useEffect(() => {
    const el = ref.current;
    const active = document.activeElement;
    if (!el) return;
    if (active === document.body || (active && el.parentElement?.contains(active))) {
      (el.querySelector<HTMLElement>('button') ?? el).focus({ preventScroll: true });
    }
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[inherit] p-4 text-center backdrop-blur-sm outline-none"
      style={{ backgroundColor: 'color-mix(in srgb, var(--song-surface-soft) 88%, transparent)' }}
    >
      {resuming ? (
        <p role="timer" className="text-3xl font-black tabular-nums" style={{ color: 'var(--song-accent-text)' }}>
          {t('overlay.resuming', { seconds: secondsUntil(pause.until, now) })}
        </p>
      ) : (
        <>
          <p role="status" className="flex items-center gap-2 text-xl font-black" style={{ color: 'var(--song-text)' }}>
            <Pause className="w-5 h-5" aria-hidden="true" /> {t('overlay.pausedBy', { name: pause.byName })}
          </p>
          <p role="timer" className="text-sm font-bold tabular-nums" style={{ color: 'var(--song-muted)' }}>
            {t('overlay.timeLeft', { seconds: secondsUntil(pause.resumingAt, now) })}
          </p>
          {isHost && (
            <button
              type="button"
              onClick={() => void onPause('resume')}
              disabled={busy}
              className={`min-h-12 rounded-xl px-6 text-base font-extrabold transition hover:brightness-110 disabled:opacity-50 ${focusRing}`}
              style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
            >
              <span className="flex items-center gap-2"><Play className="w-4 h-4" aria-hidden="true" /> {t('overlay.resume')}</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
