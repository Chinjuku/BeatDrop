'use client';
/**
 * Plays a room's clip at the server-scheduled moment. Uses one persistent <audio> element:
 * iOS only lets an element play without a tap after it has been played once inside a tap,
 * so `unlock()` must run from a user gesture (join / start / the "turn on sound" button).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// A zero-length WAV: enough to "play" inside a tap and unlock the element.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
// Late joiners still hear the clip if they are no later than this into it.
const LATE_START_GRACE_MS = 1500;

interface Options {
  /** Should this device play at all? (false for guests when only the host plays) */
  enabled: boolean;
  audioUrl?: string;
  /** Server time the clip starts. */
  playAt?: number;
  clipSeconds: number;
  /** serverClock − localClock (ms). */
  offsetMs: number;
}

export function useRoomAudio({ enabled, audioUrl, playAt, clipSeconds, offsetMs }: Options) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimer = useRef<number | undefined>(undefined);
  const stopTimer = useRef<number | undefined>(undefined);
  const triedProxy = useRef(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [playing, setPlaying] = useState(false);

  const element = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = 'auto';
      audioRef.current = el;
    }
    return audioRef.current;
  }, []);

  const clearTimers = () => {
    window.clearTimeout(startTimer.current);
    window.clearTimeout(stopTimer.current);
  };

  const stop = useCallback(() => {
    clearTimers();
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  /** Plays from `fromSeconds` until the clip length is reached. */
  const playClip = useCallback(
    async (fromSeconds = 0) => {
      const el = element();
      if (!audioUrl) return;
      clearTimers();
      try {
        el.currentTime = fromSeconds;
        await el.play();
        setNeedsTap(false);
        setPlaying(true);
        stopTimer.current = window.setTimeout(() => {
          el.pause();
          setPlaying(false);
        }, Math.max(0, (clipSeconds - fromSeconds) * 1000));
      } catch (err) {
        if ((err as DOMException)?.name === 'NotAllowedError') setNeedsTap(true);
        setPlaying(false);
      }
    },
    [audioUrl, clipSeconds, element]
  );

  /** Call from a tap. Unlocks playback for later scheduled starts. */
  const unlock = useCallback(async () => {
    const el = element();
    const previous = el.src;
    try {
      el.src = SILENT_WAV;
      await el.play();
      el.pause();
      setNeedsTap(false);
    } catch {
      // Still locked; the scheduled play will ask for a tap again.
    } finally {
      if (previous && previous !== SILENT_WAV) {
        el.src = previous;
        el.load();
      }
    }
  }, [element]);

  // Load (preload) the clip whenever the round's song changes.
  useEffect(() => {
    if (!enabled || !audioUrl) return;
    const el = element();
    triedProxy.current = false;
    el.onerror = () => {
      // Direct Apple CDN blocked (DNS / firewall): fall back to our audio proxy once.
      if (triedProxy.current || !audioUrl.startsWith('http')) return;
      triedProxy.current = true;
      el.src = `/api/proxy/audio?url=${encodeURIComponent(audioUrl)}`;
      el.load();
    };
    if (el.src !== audioUrl) {
      el.src = audioUrl;
      el.load();
    }
  }, [audioUrl, element, enabled]);

  // Schedule the start at playAt, translated into this device's clock.
  useEffect(() => {
    if (!enabled || !audioUrl || playAt === undefined) return;
    const localPlayAt = playAt - offsetMs;
    const delay = localPlayAt - Date.now();
    if (delay > 0) {
      startTimer.current = window.setTimeout(() => void playClip(0), delay);
    } else if (-delay < LATE_START_GRACE_MS) {
      void playClip(-delay / 1000);
    }
    return () => window.clearTimeout(startTimer.current);
  }, [audioUrl, enabled, offsetMs, playAt, playClip]);

  // Stop when this device should not play, and on unmount.
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);
  useEffect(() => () => {
    clearTimers();
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  return { unlock, replay: () => playClip(0), stop, needsTap, playing };
}
