'use client';
/**
 * Live rooms: a queue of "X got it!" announcements built from `view.correct`.
 * Each correct answer is announced once per round; entries older than STALE_MS (seen late, e.g.
 * after a refresh or a slow poll) are marked seen but never announced.
 */
import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '../shared/roomTypes';

type CorrectEntry = RoomView['correct'][number];

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
