/**
 * Pause rules (pure). A pause is a stored freeze: `until` is the planned end, so it auto-resumes
 * with no write. Every end (manual or automatic) includes a final resuming countdown.
 */
import { frozenAt } from './clock';
import { ROOM_LIMITS, type PauseAction } from '../../shared/roomTypes';
import { activePause, freezesOf, locate, pendingPauseRequest, type RoomState } from './timeline';

export { activePause, pendingPauseRequest, PAUSE_OUTCOME_VISIBLE_MS } from './timeline';

export type { PauseAction };
export const PAUSE_ACTIONS: readonly PauseAction[] = ['request', 'approve', 'decline', 'pause', 'resume'];

export type PauseFailure =
  | 'not-a-player'
  | 'not-host'
  | 'is-host'
  | 'wrong-phase'
  | 'buzz-hold'
  | 'already-paused'
  | 'not-paused'
  | 'no-request'
  | 'cooldown'
  | 'pending';

export type PauseOutcome = { ok: true } | { ok: false; reason: PauseFailure };

function startPause(room: RoomState, byId: string, now: number, requestedById?: string): PauseOutcome {
  const phase = locate(room, now).phase;
  if (phase !== 'countdown' && phase !== 'guessing' && phase !== 'reveal') return { ok: false, reason: 'wrong-phase' };
  if (activePause(room, now)) return { ok: false, reason: 'already-paused' };
  if (frozenAt(freezesOf(room), now)) return { ok: false, reason: 'buzz-hold' };
  room.pauses = [
    ...(room.pauses ?? []),
    {
      from: now,
      until: now + ROOM_LIMITS.pauseMaxMs + ROOM_LIMITS.pauseResumeMs,
      byId,
      ...(requestedById ? { requestedById } : {}),
    },
  ];
  return { ok: true };
}

/** Applies one pause action at server time `now`. Mutates `room` on success. */
export function applyPauseAction(room: RoomState, playerId: string, action: PauseAction, now: number): PauseOutcome {
  if (!room.players.some((p) => p.id === playerId && p.leftAt === undefined)) return { ok: false, reason: 'not-a-player' };
  const isHost = playerId === room.hostId;

  if (action === 'request') {
    // The host pauses directly; a host "request" is not a request.
    if (isHost) return { ok: false, reason: 'is-host' };
    const phase = locate(room, now).phase;
    if (phase !== 'countdown' && phase !== 'guessing' && phase !== 'reveal') return { ok: false, reason: 'wrong-phase' };
    if (activePause(room, now)) return { ok: false, reason: 'already-paused' };
    if (frozenAt(freezesOf(room), now)) return { ok: false, reason: 'buzz-hold' };
    if (pendingPauseRequest(room, now)) return { ok: false, reason: 'pending' };
    const last = room.lastPauseRequestAt?.[playerId];
    if (last !== undefined && now - last < ROOM_LIMITS.pauseCooldownMs) return { ok: false, reason: 'cooldown' };
    room.pauseRequest = { playerId, at: now };
    room.lastPauseRequestAt = { ...(room.lastPauseRequestAt ?? {}), [playerId]: now };
    return { ok: true };
  }

  if (!isHost) return { ok: false, reason: 'not-host' };

  if (action === 'pause') {
    const started = startPause(room, playerId, now);
    if (started.ok) room.pauseRequest = undefined; // the host pausing answers any pending request
    return started;
  }

  if (action === 'resume') {
    const pause = activePause(room, now);
    if (!pause) return { ok: false, reason: 'not-paused' };
    pause.until = Math.min(pause.until, now + ROOM_LIMITS.pauseResumeMs);
    return { ok: true };
  }

  const request = pendingPauseRequest(room, now);
  if (!request) return { ok: false, reason: 'no-request' };
  if (action === 'decline') {
    request.decision = 'declined';
    request.decidedAt = now;
    return { ok: true };
  }
  // approve
  const started = startPause(room, playerId, now, request.playerId);
  if (started.ok) {
    request.decision = 'approved';
    request.decidedAt = now;
  }
  return started;
}
