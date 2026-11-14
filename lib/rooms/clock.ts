/**
 * Game clock: wall-clock time with frozen intervals (pauses, buzz holds) cut out.
 * Pure helpers; all times are server wall-clock ms. A freeze covers `from <= t < until`.
 */
export interface Freeze {
  from: number;
  until: number;
}

/** Sorted, non-overlapping, non-empty freezes. */
function merged(freezes: Freeze[]): Freeze[] {
  const sorted = freezes.filter((f) => f.until > f.from).sort((a, b) => a.from - b.from);
  const out: Freeze[] = [];
  for (const f of sorted) {
    const last = out[out.length - 1];
    if (last && f.from <= last.until) last.until = Math.max(last.until, f.until);
    else out.push({ from: f.from, until: f.until });
  }
  return out;
}

/** Unfrozen time between `from` and `to` (wall time minus overlap with freezes). */
export function activeElapsed(freezes: Freeze[], from: number, to: number): number {
  if (to <= from) return 0;
  let frozen = 0;
  for (const f of merged(freezes)) {
    frozen += Math.max(0, Math.min(to, f.until) - Math.max(from, f.from));
  }
  return to - from - frozen;
}

/**
 * Wall time at which `activeMs` of unfrozen time has passed after `start`. A target reached
 * exactly when a freeze starts resolves to that start (before the freeze).
 */
export function wallAfter(freezes: Freeze[], start: number, activeMs: number): number {
  let cursor = start;
  let remaining = Math.max(0, activeMs);
  for (const f of merged(freezes)) {
    if (f.until <= cursor) continue;
    if (f.from > cursor) {
      const gap = f.from - cursor;
      if (remaining <= gap) return cursor + remaining;
      remaining -= gap;
    }
    cursor = f.until;
  }
  return cursor + remaining;
}

/** The freeze covering `t`, if any. */
export function frozenAt(freezes: Freeze[], t: number): Freeze | undefined {
  return freezes.find((f) => f.from <= t && t < f.until);
}
