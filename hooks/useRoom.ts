'use client';
/**
 * Client side of a live room: keeps the player's credentials, polls the room about once a
 * second, estimates the offset between this device's clock and the server's, and sends actions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomSettings, RoomView } from '../shared/roomTypes';
import type { Song } from '../shared/types';

export interface RoomPreview {
  code: string;
  players: number;
  full: boolean;
  started: boolean;
  settings: RoomSettings;
}

export type RoomErrorKey = 'notFound' | 'full' | 'name' | 'unavailable' | 'noSongs' | 'network' | 'generic';

interface Credentials {
  token: string;
  name: string;
}

const credKey = (code: string) => `beatdrop:room:${code}`;

// sessionStorage: survives a refresh, ends with the tab. Strictly necessary for the room to work.
export function saveRoomCredentials(code: string, creds: Credentials) {
  try {
    sessionStorage.setItem(credKey(code), JSON.stringify(creds));
  } catch {}
}

function loadCredentials(code: string): Credentials | null {
  try {
    const raw = sessionStorage.getItem(credKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    return typeof parsed.token === 'string' && typeof parsed.name === 'string'
      ? { token: parsed.token, name: parsed.name }
      : null;
  } catch {
    return null;
  }
}

function clearCredentials(code: string) {
  try {
    sessionStorage.removeItem(credKey(code));
  } catch {}
}

export function errorKeyFor(status: number, message?: string): RoomErrorKey {
  if (status === 503 && message?.includes('shared store')) return 'unavailable';
  if (status === 404 && message?.includes('songs')) return 'noSongs';
  if (status === 404) return 'notFound';
  if (status === 409 && message?.includes('full')) return 'full';
  if (status === 400) return 'name';
  return 'generic';
}

function pollDelay(view: RoomView | null): number {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return 4000;
  if (!view || view.phase === 'lobby' || view.phase === 'finished') return 2000;
  // Buzzer rounds change hands quickly; see who has the buzzer sooner.
  if (view.settings.mode === 'buzzer' && view.phase === 'guessing') return 600;
  return 1000;
}

export function useRoom(code: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [error, setError] = useState<RoomErrorKey | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<{ correct: boolean; points: number; attemptsLeft: number } | null>(null);
  const [savedName, setSavedName] = useState('');
  /** serverClock − localClock (ms), from the poll with the smallest round trip. */
  const [offsetMs, setOffsetMs] = useState(0);

  const credsRef = useRef<Credentials | null>(null);
  const bestRttRef = useRef(Number.POSITIVE_INFINITY);
  const viewRef = useRef<RoomView | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const stoppedRef = useRef(false);

  const accept = useCallback((next: RoomView) => {
    // Ignore a response older than what we already show (an answer and a poll can cross).
    if (viewRef.current && next.version < viewRef.current.version) return;
    if (viewRef.current && next.phase !== viewRef.current.phase && next.phase === 'countdown') setLastAnswer(null);
    viewRef.current = next;
    setView(next);
  }, []);

  const request = useCallback(
    async (path: string, init: { method: 'GET' | 'POST'; body?: unknown }) => {
      const headers: Record<string, string> = {};
      const tokenUsed = credsRef.current?.token ?? null;
      if (tokenUsed) headers['x-room-token'] = tokenUsed;
      if (init.body !== undefined) headers['content-type'] = 'application/json';
      const sentAt = Date.now();
      const res = await fetch(`/api/rooms/${code}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: 'no-store',
      });
      const receivedAt = Date.now();
      const json = await res.json().catch(() => null);
      const room: RoomView | undefined = json?.data?.room;
      if (room && typeof room.serverNow === 'number') {
        // Assume the server built the view halfway through the round trip.
        const rtt = receivedAt - sentAt;
        if (rtt <= bestRttRef.current + 20) {
          bestRttRef.current = Math.min(bestRttRef.current, rtt);
          setOffsetMs(room.serverNow - (sentAt + rtt / 2));
        }
      }
      return { res, json, room, tokenUsed };
    },
    [code]
  );

  const poll = useCallback(async () => {
    try {
      const { res, json, room, tokenUsed } = await request('', { method: 'GET' });
      setOffline(false);
      // A poll sent before we joined (or with an older token) must not override what joining did.
      if (tokenUsed !== (credsRef.current?.token ?? null)) return;
      if (room) {
        accept(room);
        setError(null);
      } else if (json?.data?.preview) {
        setPreview(json.data.preview as RoomPreview);
        if (credsRef.current) {
          // Our token no longer belongs to this room (it was recreated or we were removed).
          clearCredentials(code);
          credsRef.current = null;
          viewRef.current = null;
          setView(null);
        }
      } else if (!res.ok) {
        setError(errorKeyFor(res.status, json?.message));
      }
    } catch {
      setOffline(true);
    }
  }, [accept, code, request]);

  useEffect(() => {
    stoppedRef.current = false;
    credsRef.current = loadCredentials(code);
    setSavedName(credsRef.current?.name ?? '');
    const loop = async () => {
      await poll();
      if (stoppedRef.current) return;
      timerRef.current = window.setTimeout(loop, pollDelay(viewRef.current));
    };
    void loop();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timerRef.current);
        void loop();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stoppedRef.current = true;
      window.clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [code, poll]);

  const runAction = useCallback(
    async (path: string, body?: unknown) => {
      setBusy(true);
      try {
        const { res, json, room } = await request(path, { method: 'POST', body });
        if (room) accept(room);
        if (!res.ok) setError(errorKeyFor(res.status, json?.message));
        return { ok: res.ok, json };
      } catch {
        setOffline(true);
        return { ok: false, json: null };
      } finally {
        setBusy(false);
      }
    },
    [accept, request]
  );

  const join = useCallback(
    async (name: string) => {
      const { ok, json } = await runAction('/join', { name });
      if (ok && typeof json?.data?.playerToken === 'string') {
        credsRef.current = { token: json.data.playerToken, name };
        saveRoomCredentials(code, credsRef.current);
        setSavedName(name);
        setError(null);
      }
      return ok;
    },
    [code, runAction]
  );

  const start = useCallback(() => runAction('/start'), [runAction]);

  const answer = useCallback(
    async (song: Song) => {
      const { ok, json } = await runAction('/answer', {
        candidateTrackId: song.id,
        candidateTitle: song.title,
        candidateArtist: song.artistName,
      });
      if (ok && json?.data?.answer) setLastAnswer(json.data.answer);
      else if (!ok) setError(null); // a late guess after the timer is not worth an error banner
    },
    [runAction]
  );

  /** Buzzer mode. Losing the race is normal: the 409 response still carries the current view. */
  const buzz = useCallback(async () => {
    const { ok } = await runAction('/buzz');
    if (!ok) setError(null);
    return ok;
  }, [runAction]);

  const leave = useCallback(async () => {
    await runAction('/leave');
    clearCredentials(code);
    credsRef.current = null;
  }, [code, runAction]);

  return { view, preview, error, offline, busy, lastAnswer, offsetMs, savedName, join, start, answer, buzz, leave };
}

/** Server-aligned "now", re-rendered every `intervalMs` while active. */
export function useServerNow(offsetMs: number, active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    setNow(Date.now() + offsetMs);
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, offsetMs]);
  return now;
}
