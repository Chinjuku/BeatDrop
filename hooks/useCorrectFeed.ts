'use client';
/**
 * Live rooms: a queue of "X got it!" announcements built from `view.correct`.
 * Each correct answer is announced once per round; entries older than STALE_MS (seen late, e.g.
 * after a refresh or a slow poll) are marked seen but never announced.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomView } from '../shared/roomTypes';

export type CorrectEntry = RoomView['correct'][number];

const STALE_MS = 3000;

/** Pure: entries not yet in `seen` and no older than STALE_MS. Adds every entry's key to `seen`. */
export function newCorrectEntries(
  seen: Set<string>,
  roundIndex: number,
  entries: RoomView['correct'],
  now: number
): RoomView['correct'] {
  const fresh: CorrectEntry[] = [];
  for (const entry of entries) {
    const key = `${roundIndex}:${entry.playerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (now - entry.at > STALE_MS) continue;
    fresh.push(entry);
  }
  return fresh;
}

/** Announcements that arrived with the latest view; the caller decides how long to show them. */
export function useCorrectFeed(view: RoomView | null, now: number): CorrectEntry[] {
  const seenRef = useRef(new Set<string>());
  const [queue, setQueue] = useState<CorrectEntry[]>([]);

  const roundIndex = view?.roundIndex;
  const correct = view?.correct;
  useEffect(() => {
    // Cheap and idempotent: `seen` makes repeat calls (every tick of `now`) return nothing.
    const fresh = roundIndex === undefined || !correct ? [] : newCorrectEntries(seenRef.current, roundIndex, correct, now);
    // Append new announcements and drop ones that have gone stale.
    setQueue((q) => {
      const kept = q.filter((e) => now - e.at <= STALE_MS);
      return fresh.length === 0 && kept.length === q.length ? q : [...kept, ...fresh];
    });
  }, [roundIndex, correct, now]);

  return queue;
}

export const correctEntryKey = (e: CorrectEntry) => `${e.playerId}:${e.at}`;

/** Display durations. The CSS animations read these through the `--bd-dur` variable (never hardcode them in CSS). */
export const CORRECT_TOAST_MS = 2000;
/** Toast duration while more are waiting behind it. */
export const CORRECT_TOAST_FAST_MS = 900;
export const CORRECT_BURST_MS = 1500;
export const CORRECT_POP_MS = 1200;
const MAX_PENDING = 3;

export type ShownCorrect = { entry: CorrectEntry; more?: undefined; durationMs: number } | { entry?: undefined; more: number; durationMs: number };

/**
 * Shows `entries` one at a time, queueing the rest (at most `maxPending`; extra ones coalesce into
 * one "+N more" item). Each entry is shown at most once. While more are waiting, items use
 * `fastMs`. The queue and the shown item reset when `resetKey` (the round) changes. Timers are
 * cleared on unmount.
 */
export function useShownEntry(
  entries: CorrectEntry[],
  durationMs: number,
  resetKey: number,
  opts: { fastMs?: number; maxPending?: number } = {}
): ShownCorrect | null {
  const { fastMs = durationMs, maxPending = Infinity } = opts;
  const seenRef = useRef(new Set<string>());
  const pendingRef = useRef<CorrectEntry[]>([]);
  const overflowRef = useRef(0);
  const [current, setCurrent] = useState<ShownCorrect | null>(null);
  const currentRef = useRef<ShownCorrect | null>(null);

  const advance = useCallback(() => {
    let next: ShownCorrect | null = null;
    const waiting = () => pendingRef.current.length + (overflowRef.current > 0 ? 1 : 0);
    const entry = pendingRef.current.shift();
    if (entry) {
      next = { entry, durationMs: waiting() > 0 ? fastMs : durationMs };
    } else if (overflowRef.current > 0) {
      next = { more: overflowRef.current, durationMs };
      overflowRef.current = 0;
    }
    currentRef.current = next;
    setCurrent(next);
  }, [durationMs, fastMs]);

  // New round: drop everything queued or on screen. Declared before the enqueue effect so it runs first.
  const lastKeyRef = useRef(resetKey);
  useEffect(() => {
    if (lastKeyRef.current === resetKey) return;
    lastKeyRef.current = resetKey;
    pendingRef.current = [];
    overflowRef.current = 0;
    currentRef.current = null;
    setCurrent(null);
  }, [resetKey]);

  useEffect(() => {
    for (const e of entries) {
      const key = correctEntryKey(e);
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      if (pendingRef.current.length < maxPending) pendingRef.current.push(e);
      else overflowRef.current += 1;
    }
    if (!currentRef.current && (pendingRef.current.length > 0 || overflowRef.current > 0)) advance();
  }, [entries, advance, maxPending]);

  useEffect(() => {
    if (!current) return;
    const id = window.setTimeout(advance, current.durationMs);
    return () => window.clearTimeout(id);
  }, [current, advance]);

  return current;
}

export { MAX_PENDING };
