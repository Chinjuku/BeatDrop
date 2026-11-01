'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type AudioPlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

// Phase 2: Audio Pre-buffering Cache (Zero-delay instant audio playback)
interface CachedAudioEntry {
  buffer: AudioBuffer;
  soundOffset: number;
}

const audioBufferCache = new Map<string, CachedAudioEntry>();
const MAX_AUDIO_CACHE = 25;

/**
 * Songspot B: Recognizable Intro Detection (Dead Air / Silence Trimmer)
 * Scans the first 2.0s of the channel data to find the first audible sound/transient (> -38dB).
 * Leaves a 10ms pre-roll to preserve natural transient attack of drums/instruments.
 */
export function findAudibleIntroOffset(buffer: AudioBuffer, threshold = 0.012): number {
  try {
    const channel = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const scanLimit = Math.min(channel.length, Math.floor(sampleRate * 2.0));

    for (let i = 0; i < scanLimit; i++) {
      if (Math.abs(channel[i]) >= threshold) {
        return Math.max(0, i / sampleRate - 0.01);
      }
    }
  } catch {}
  return 0;
}

export async function prefetchAudio(url: string | null | undefined, ctx?: AudioContext): Promise<void> {
  if (!url || typeof window === 'undefined' || audioBufferCache.has(url)) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const arrBuf = await res.arrayBuffer();
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = ctx || new Ctx();
    const decoded = await context.decodeAudioData(arrBuf.slice(0));
    const soundOffset = findAudibleIntroOffset(decoded);

    if (audioBufferCache.size >= MAX_AUDIO_CACHE) {
      const oldest = audioBufferCache.keys().next().value;
      if (oldest) audioBufferCache.delete(oldest);
    }
    audioBufferCache.set(url, { buffer: decoded, soundOffset });
  } catch {}
}

interface UseAudioControllerOptions {
  audioUrl: string | null;
  volume: number; // 0 to 100
}

export function useAudioController({ audioUrl, volume }: UseAudioControllerOptions) {
  const [state, setState] = useState<AudioPlaybackState>('idle');
  const [progress, setProgress] = useState<number>(0); // 0..1
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(30);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<AudioNode & { gain: AudioParam } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Track timing for pause/resume & seek in full preview mode
  const startCtxTimeRef = useRef<number>(0);
  const offsetSecondsRef = useRef<number>(0);
  const activeClipLimitRef = useRef<number>(30);
  const soundStartOffsetRef = useRef<number>(0);

  const getContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Pre-warm / unlock AudioContext on touch or click (iOS/iPadOS & Android mobile policy)
  useEffect(() => {
    const unlock = () => {
      const ctx = getContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('click', unlock, { passive: true });
    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('click', unlock);
    };
  }, [getContext]);

  const stopInternal = useCallback((resetOffset = true, targetState: AudioPlaybackState = 'ready') => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      try {
        sourceRef.current.stop();
      } catch {}
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (gainRef.current) {
      gainRef.current.disconnect();
      gainRef.current = null;
    }
    if (resetOffset) {
      offsetSecondsRef.current = 0;
      setProgress(0);
      setCurrentTime(0);
      if (bufferRef.current) {
        setState(targetState);
      }
    }
  }, []);

  // Load and decode audio buffer when audioUrl changes
  useEffect(() => {
    if (!audioUrl) {
      bufferRef.current = null;
      setState('idle');
      return;
    }

    // 1. Instant hit from audio pre-buffer cache (Zero audio delay)
    const cached = audioBufferCache.get(audioUrl);
    if (cached) {
      stopInternal(true);
      bufferRef.current = cached.buffer;
      soundStartOffsetRef.current = cached.soundOffset;
      setTotalDuration(Math.min(30, cached.buffer.duration));
      setState('ready');
      return;
    }

    let cancelled = false;
    stopInternal(true);
    setState('loading');

    fetch(audioUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((arrBuf) => {
        const ctx = getContext();
        return ctx.decodeAudioData(arrBuf.slice(0));
      })
      .then((decoded) => {
        if (cancelled) return;
        const soundOffset = findAudibleIntroOffset(decoded);
        if (audioBufferCache.size >= MAX_AUDIO_CACHE) {
          const oldest = audioBufferCache.keys().next().value;
          if (oldest) audioBufferCache.delete(oldest);
        }
        audioBufferCache.set(audioUrl, { buffer: decoded, soundOffset });
        bufferRef.current = decoded;
        soundStartOffsetRef.current = soundOffset;
        setTotalDuration(Math.min(30, decoded.duration));
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Audio decode error:', err);
        setState('error');
      });

    return () => {
      cancelled = true;
      stopInternal(true);
    };
  }, [audioUrl, getContext, stopInternal]);

  // Live volume update
  useEffect(() => {
    if (gainRef.current && audioCtxRef.current) {
      const normalized = Math.min(1, Math.max(0, volume / 100));
      gainRef.current.gain.setValueAtTime(normalized, audioCtxRef.current.currentTime);
    }
  }, [volume]);

  const startPlaybackFrom = useCallback(
    (startOffset: number, maxDurationSeconds: number) => {
      const buffer = bufferRef.current;
      if (!buffer) return;

      const ctx = getContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      stopInternal(false);

      const cappedMax = Math.min(maxDurationSeconds, buffer.duration);
      const safeOffset = Math.min(Math.max(0, startOffset), Math.max(0, cappedMax - 0.05));
      const remainingPlayTime = Math.max(0.05, cappedMax - safeOffset);

      activeClipLimitRef.current = cappedMax;
      offsetSecondsRef.current = safeOffset;

      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.min(1, Math.max(0, volume / 100)), ctx.currentTime);

      source.buffer = buffer;
      source.connect(gain);
      gain.connect(ctx.destination);

      sourceRef.current = source;
      gainRef.current = gain;

      const now = ctx.currentTime;
      const startPerf = performance.now();
      startCtxTimeRef.current = now;
      setState('playing');

      const tick = () => {
        if (sourceRef.current !== source) return;
        const audioElapsed = ctx.currentTime - now;
        const perfElapsed = (performance.now() - startPerf) / 1000;
        const elapsedInRun = Math.max(0, Math.max(audioElapsed, perfElapsed));
        const absolutePos = Math.min(cappedMax, safeOffset + elapsedInRun);

        const isSnippet = cappedMax < 25;
        const progressVal = isSnippet
          ? (remainingPlayTime > 0 ? Math.min(1, elapsedInRun / remainingPlayTime) : 0)
          : (cappedMax > 0 ? Math.min(1, absolutePos / cappedMax) : 0);

        setCurrentTime(isSnippet ? elapsedInRun : absolutePos);
        setProgress(progressVal);

        if (absolutePos < cappedMax && elapsedInRun < remainingPlayTime) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };

      rafRef.current = requestAnimationFrame(tick);

      source.onended = () => {
        if (sourceRef.current === source) {
          stopInternal(true, 'ended');
        }
      };

      source.start(now, safeOffset, remainingPlayTime);
      source.stop(now + remainingPlayTime);
    },
    [getContext, stopInternal, volume]
  );

  // Play a specific snippet length (Songspot B: skips dead air / silence at intro)
  const playSnippet = useCallback(
    (clipSeconds: number) => {
      const introOffset = soundStartOffsetRef.current;
      startPlaybackFrom(introOffset, introOffset + clipSeconds);
    },
    [startPlaybackFrom]
  );

  // Play or resume the full 30s preview (post-game reveal)
  const playFullPreview = useCallback(() => {
    const buffer = bufferRef.current;
    if (!buffer) return;
    const maxDur = Math.min(30, buffer.duration);
    const resumeFrom = offsetSecondsRef.current >= maxDur - 0.2 ? 0 : offsetSecondsRef.current;
    startPlaybackFrom(resumeFrom, maxDur);
  }, [startPlaybackFrom]);

  // Pause the full 30s preview preserving current seek position
  const pauseFullPreview = useCallback(() => {
    if (state !== 'playing' || !audioCtxRef.current) return;
    const elapsed = audioCtxRef.current.currentTime - startCtxTimeRef.current;
    offsetSecondsRef.current = Math.min(
      activeClipLimitRef.current,
      offsetSecondsRef.current + Math.max(0, elapsed)
    );
    stopInternal(false);
    setState('paused');
  }, [state, stopInternal]);

  // Seek to an exact second in the 30s preview
  const seekFullPreview = useCallback(
    (targetSeconds: number) => {
      const buffer = bufferRef.current;
      if (!buffer) return;
      const maxDur = Math.min(30, buffer.duration);
      const clamped = Math.min(maxDur, Math.max(0, targetSeconds));
      offsetSecondsRef.current = clamped;
      setCurrentTime(clamped);
      setProgress(maxDur > 0 ? clamped / maxDur : 0);

      if (state === 'playing') {
        startPlaybackFrom(clamped, maxDur);
      }
    },
    [startPlaybackFrom, state]
  );

  const stop = useCallback(() => {
    stopInternal(true);
  }, [stopInternal]);

  return {
    state,
    progress,
    currentTime,
    totalDuration,
    playSnippet,
    playFullPreview,
    pauseFullPreview,
    seekFullPreview,
    stop,
  };
}

