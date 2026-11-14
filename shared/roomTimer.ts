/** Round timer maths shared by the room UI. `endsAt` already includes planned freezes. */
export interface TimerView {
  endsAt?: number;
  pause?: { until: number };
  buzz?: { holderId?: string; deadline?: number };
  /** True when the server's clock is stopped (pause or buzz hold); false for pre-upgrade rooms. */
  frozen?: boolean;
}

/** Time left in the round. Stands still while a pause or buzz hold is running, then counts down. */
export function roundRemainingMs(view: TimerView, now: number): number {
  if (view.endsAt === undefined) return 0;
  const holdEnd = view.frozen && view.buzz?.holderId ? view.buzz.deadline : undefined;
  const freezeEnd = view.pause?.until ?? holdEnd;
  return Math.max(0, view.endsAt - Math.max(now, freezeEnd ?? now));
}

/** Progress-bar fill, 0..1. */
export function roundProgress(remainingMs: number, windowMs: number): number {
  if (windowMs <= 0) return 0;
  return Math.min(1, Math.max(0, remainingMs / windowMs));
}
