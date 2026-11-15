'use client';

/**
 * One `<audio>` element for the artist page: plays one 30 s preview at a time, optionally
 * through a shuffled queue, and cleans up on unmount (leaving the page stops the music).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ARTIST_PREVIEW_SECONDS, shuffleOrder, type ArtistPageSong } from '../shared/artistPage';

export type PreviewStatus = 'idle' | 'loading' | 'playing' | 'paused';

export interface ArtistPreviewPlayer {
  current: ArtistPageSong | null;
  status: PreviewStatus;
  /** Seconds into the current preview, capped at ARTIST_PREVIEW_SECONDS. */
  elapsed: number;
  shuffle: boolean;
  /** Songs whose preview failed to load in this visit. */
  failedIds: ReadonlySet<string>;
  /** Play `song`, or pause/resume it when it is the current one. Leaves shuffle mode. */
  toggle: (song: ArtistPageSong) => void;
  /** Resume or pause whatever is current (mini-player button). */
  togglePlayback: () => void;
  playShuffle: (songs: readonly ArtistPageSong[]) => void;
  next: () => void;
  stop: () => void;
}

export function useArtistPreviewPlayer(): ArtistPreviewPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<ArtistPageSong[]>([]);
  const shuffleRef = useRef(false);
  const currentRef = useRef<ArtistPageSong | null>(null);
  const failedRef = useRef<Set<string>>(new Set());
  const listenersRef = useRef<AbortController | null>(null);

  const [current, setCurrent] = useState<ArtistPageSong | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(() => new Set());

  // Handlers read refs, so the listeners attached once never go stale.
  const handlersRef = useRef<{ finished: () => void; failed: () => void }>({ finished: () => {}, failed: () => {} });

  const setShuffleMode = (on: boolean) => {
    shuffleRef.current = on;
    setShuffle(on);
    if (!on) queueRef.current = [];
  };

  const ensureAudio = (): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = 'auto';
    const listeners = new AbortController();
    listenersRef.current = listeners;
    const { signal } = listeners;
    audio.addEventListener('timeupdate', () => {
      const t = Math.min(audio.currentTime, ARTIST_PREVIEW_SECONDS);
      setElapsed(t);
      if (audio.currentTime >= ARTIST_PREVIEW_SECONDS) handlersRef.current.finished();
    }, { signal });
    audio.addEventListener('playing', () => setStatus('playing'), { signal });
    audio.addEventListener('waiting', () => setStatus((s) => (s === 'paused' ? s : 'loading')), { signal });
    audio.addEventListener('ended', () => handlersRef.current.finished(), { signal });
    audio.addEventListener('error', () => {
      // Clearing the src (stop) can also fire `error`; only a real load failure counts.
      if (audio.getAttribute('src')) handlersRef.current.failed();
    }, { signal });
    audioRef.current = audio;
    return audio;
  };

  const resetAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };

  const stop = useCallback(() => {
    resetAudio();
    setShuffleMode(false);
    currentRef.current = null;
    setCurrent(null);
    setStatus('idle');
    setElapsed(0);
  }, []);

  const play = useCallback((song: ArtistPageSong) => {
    const audio = ensureAudio();
    currentRef.current = song;
    setCurrent(song);
    setElapsed(0);
    setStatus('loading');
    audio.src = song.audioUrl;
    audio.currentTime = 0;
    audio.play().catch((err: unknown) => {
      // A newer play()/pause() interrupted this one: not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (currentRef.current?.id === song.id) handlersRef.current.failed();
    });
  }, []);

  const next = useCallback(() => {
    const upcoming = queueRef.current.shift();
    if (upcoming) play(upcoming);
    else stop();
  }, [play, stop]);

  handlersRef.current.finished = () => {
    if (shuffleRef.current && queueRef.current.length > 0) {
      next();
      return;
    }
    resetAudio();
    setShuffleMode(false);
    setElapsed(ARTIST_PREVIEW_SECONDS);
    // Keep the finished song in the mini-player; with its src cleared, resume restarts it.
    setStatus('paused');
  };

  handlersRef.current.failed = () => {
    const song = currentRef.current;
    if (song) {
      failedRef.current.add(song.id);
      setFailedIds(new Set(failedRef.current));
    }
    if (shuffleRef.current && queueRef.current.length > 0) {
      next();
      return;
    }
    stop();
  };

  const resume = useCallback(() => {
    const audio = audioRef.current;
    const song = currentRef.current;
    if (!audio || !song) return;
    if (!audio.getAttribute('src')) {
      play(song);
      return;
    }
    setStatus('loading');
    audio.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      handlersRef.current.failed();
    });
  }, [play]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setStatus('paused');
  }, []);

  const togglePlayback = useCallback(() => {
    if (!currentRef.current) return;
    if (status === 'playing' || status === 'loading') pause();
    else resume();
  }, [status, pause, resume]);

  const toggle = useCallback(
    (song: ArtistPageSong) => {
      if (currentRef.current?.id === song.id) {
        togglePlayback();
        return;
      }
      setShuffleMode(false);
      play(song);
    },
    [play, togglePlayback]
  );

  const playShuffle = useCallback(
    (songs: readonly ArtistPageSong[]) => {
      const order = shuffleOrder(songs.filter((s) => !failedRef.current.has(s.id)));
      const first = order.shift();
      if (!first) return;
      setShuffleMode(true);
      queueRef.current = order;
      play(first);
    },
    [play]
  );

  useEffect(
    () => () => {
      listenersRef.current?.abort();
      listenersRef.current = null;
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      audioRef.current = null;
    },
    []
  );

  return { current, status, elapsed, shuffle, failedIds, toggle, togglePlayback, playShuffle, next, stop };
}
