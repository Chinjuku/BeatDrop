'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_SNIPPET_DURATION, MIN_SNIPPET_DURATION } from '../types';

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

/**
 * Detects whether the user or mobile browser has enabled Data Saver (Save-Data)
 * or is on an extremely restricted connection (slow-2g).
 */
export function isSaveDataEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(conn?.saveData || conn?.effectiveType === 'slow-2g');
}

export async function prefetchAudio(url: string | null | undefined, ctx?: AudioContext): Promise<void> {
  if (!url || typeof window === 'undefined' || audioBufferCache.has(url)) return;
  // Respect user's mobile Data Saver mode: skip eager background audio buffering
  if (isSaveDataEnabled()) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const arrBuf = await res.arrayBuffer();
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = ctx || new Ctx({ latencyHint: 'interactive' });
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
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);
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
      audioCtxRef.current = new Ctx({ latencyHint: 'interactive' });
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
    if (htmlAudioRef.current) {
      try {
        htmlAudioRef.current.pause();
      } catch {}
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
      if (audioCtxRef.current) {
        try {
          const ctx = audioCtxRef.current;
          gainRef.current.gain.cancelScheduledValues(ctx.currentTime);
          gainRef.current.gain.setValueAtTime(gainRef.current.gain.value, ctx.currentTime);
          gainRef.current.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.015);
        } catch {}
      }
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

  const startPlaybackFrom = useCallback(
    (startOffset: number, maxDurationSeconds: number) => {
      const buffer = bufferRef.current;
      if (!buffer) {
        if (htmlAudioRef.current) {
          const audio = htmlAudioRef.current;
          stopInternal(false);
          const cappedMax = Math.min(maxDurationSeconds, audio.duration || 30);
          const safeOffset = Math.min(Math.max(0, startOffset), Math.max(0, cappedMax - 0.05));
          const remainingPlayTime = Math.max(0.05, cappedMax - safeOffset);

          activeClipLimitRef.current = cappedMax;
          offsetSecondsRef.current = safeOffset;
          audio.volume = Math.min(1, Math.max(0, volume / 100));
          audio.currentTime = safeOffset;

          const startPerf = performance.now();
          setState('playing');

          const tick = () => {
            if (htmlAudioRef.current !== audio || audio.paused) return;
            const elapsedInRun = (performance.now() - startPerf) / 1000;
            const absolutePos = Math.min(cappedMax, safeOffset + elapsedInRun);
            const isSnippet = cappedMax < 25;
            const progressVal = isSnippet
              ? (remainingPlayTime > 0 ? Math.min(1, elapsedInRun / remainingPlayTime) : 0)
              : (cappedMax > 0 ? Math.min(1, absolutePos / cappedMax) : 0);

            setCurrentTime(isSnippet ? elapsedInRun : absolutePos);
            setProgress(progressVal);

            if (elapsedInRun >= remainingPlayTime || absolutePos >= cappedMax) {
              stopInternal(true, 'ended');
            } else {
              rafRef.current = requestAnimationFrame(tick);
            }
          };

          audio.play().then(() => {
            rafRef.current = requestAnimationFrame(tick);
          }).catch(() => {
            setState('error');
          });
        }
        return;
      }

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
      const targetVolume = Math.min(1, Math.max(0, volume / 100));
      const now = ctx.currentTime;

      // Anti-pop hardware micro-ramps (Fade-in 5ms, Fade-out 20ms) - sample-accurate under battery saver / low power mode
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(targetVolume, now + 0.005);
      const fadeOutSec = 0.02;
      if (remainingPlayTime > fadeOutSec) {
        gain.gain.setValueAtTime(targetVolume, now + remainingPlayTime - fadeOutSec);
        gain.gain.linearRampToValueAtTime(0.0001, now + remainingPlayTime);
      }

      source.buffer = buffer;
      source.connect(gain);
      gain.connect(ctx.destination);

      sourceRef.current = source;
      gainRef.current = gain;

      const startPerf = performance.now();
      startCtxTimeRef.current = now;
      setState('playing');

      const tick = () => {
        if (sourceRef.current !== source) return;
        const audioElapsed = ctx.currentTime - now;
        const perfElapsed = (performance.now() - startPerf) / 1000;
        const elapsedInRun = Math.max(0, Math.max(audioElapsed, perfElapsed));

        // Output latency compensation for Bluetooth speakers / AirPods
        const outputLatency = typeof ctx.outputLatency === 'number' ? ctx.outputLatency : 0;
        const audibleElapsed = Math.max(0, elapsedInRun - outputLatency);
        const absolutePos = Math.min(cappedMax, safeOffset + audibleElapsed);

        const isSnippet = cappedMax < 25;
        const progressVal = isSnippet
          ? (remainingPlayTime > 0 ? Math.min(1, audibleElapsed / remainingPlayTime) : 0)
          : (cappedMax > 0 ? Math.min(1, absolutePos / cappedMax) : 0);

        setCurrentTime(isSnippet ? audibleElapsed : absolutePos);
        setProgress(progressVal);

        if (absolutePos < cappedMax && elapsedInRun < remainingPlayTime) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };

      rafRef.current = requestAnimationFrame(tick);

      source.onended = () => {
        if (sourceRef.current === source) {
          setProgress(1);
          stopInternal(true, 'ended');
        }
      };

      source.start(now, safeOffset, remainingPlayTime);
      source.stop(now + remainingPlayTime);
    },
    [getContext, stopInternal, volume]
  );

  const pendingAutoPlayRef = useRef<{ clipSeconds?: number; isFull?: boolean } | null>(null);

  // Load and decode audio buffer with Wi-Fi <-> Cellular handover retry and auto-heal
  const loadAudio = useCallback(
    (autoPlayOnReady = false, pendingClipSeconds?: number, pendingIsFull?: boolean) => {
      if (!audioUrl) {
        bufferRef.current = null;
        setState('idle');
        return () => {};
      }

      if (autoPlayOnReady) {
        pendingAutoPlayRef.current = { clipSeconds: pendingClipSeconds, isFull: pendingIsFull };
      }

      // 1. Instant hit from audio pre-buffer cache (Zero audio delay)
      const cached = audioBufferCache.get(audioUrl);
      if (cached) {
        stopInternal(true);
        bufferRef.current = cached.buffer;
        soundStartOffsetRef.current = cached.soundOffset;
        setTotalDuration(Math.min(30, cached.buffer.duration));
        setState('ready');
        if (pendingAutoPlayRef.current) {
          const { clipSeconds, isFull } = pendingAutoPlayRef.current;
          pendingAutoPlayRef.current = null;
          if (isFull) {
            startPlaybackFrom(0, Math.min(30, cached.buffer.duration));
          } else if (clipSeconds) {
            const introOffset = cached.soundOffset;
            startPlaybackFrom(introOffset, introOffset + clipSeconds);
          }
        }
        return () => {};
      }

      let cancelled = false;
      stopInternal(true);
      setState('loading');

      // Handover-resilient fetch: retry up to 2 times with backoff on network handover/drop
      const fetchBufferWithRetry = async (url: string, retries = 2, delayMs = 600): Promise<ArrayBuffer> => {
        for (let attempt = 0; attempt <= retries; attempt++) {
          if (cancelled) throw new Error('Cancelled');
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.arrayBuffer();
          } catch (err) {
            if (cancelled) throw err;
            if (attempt < retries) {
              await new Promise((r) => setTimeout(r, delayMs * Math.pow(1.5, attempt)));
            } else {
              throw err;
            }
          }
        }
        throw new Error('Audio download failed after retries');
      };

      fetchBufferWithRetry(audioUrl)
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

          if (pendingAutoPlayRef.current) {
            const { clipSeconds, isFull } = pendingAutoPlayRef.current;
            pendingAutoPlayRef.current = null;
            if (isFull) {
              startPlaybackFrom(0, Math.min(30, decoded.duration));
            } else if (clipSeconds) {
              startPlaybackFrom(soundOffset, soundOffset + clipSeconds);
            }
          }
        })
        .catch((err) => {
          if (cancelled) return;
          // Graceful HTML5 Audio fallback for slow 3G / decode issue
          try {
            const audio = new Audio(audioUrl);
            audio.preload = isSaveDataEnabled() ? 'metadata' : 'auto';
            audio.volume = Math.min(1, Math.max(0, volume / 100));
            htmlAudioRef.current = audio;
            audio.oncanplay = () => {
              if (!cancelled) {
                setTotalDuration(audio.duration || 30);
                setState('ready');
                if (pendingAutoPlayRef.current) {
                  const { clipSeconds, isFull } = pendingAutoPlayRef.current;
                  pendingAutoPlayRef.current = null;
                  const maxDur = Math.min(30, audio.duration || 30);
                  if (isFull) {
                    startPlaybackFrom(0, maxDur);
                  } else if (clipSeconds) {
                    startPlaybackFrom(0, clipSeconds);
                  }
                }
              }
            };
            audio.onerror = () => {
              if (!cancelled) {
                console.error('Audio decode & HTML5 fallback error:', err);
                setState('error');
              }
            };
          } catch {
            console.error('Audio decode error:', err);
            setState('error');
          }
        });

      return () => {
        cancelled = true;
        stopInternal(true);
      };
    },
    [audioUrl, getContext, stopInternal, volume, startPlaybackFrom]
  );

  useEffect(() => {
    const cleanup = loadAudio();
    return () => {
      cleanup();
    };
  }, [loadAudio]);

  // Auto-heal when network reconnects (e.g. mobile Wi-Fi <-> Cellular handover)
  useEffect(() => {
    const handleOnline = () => {
      if (!bufferRef.current && audioUrl && (state === 'error' || state === 'loading')) {
        loadAudio();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [audioUrl, state, loadAudio]);

  // Live volume update
  useEffect(() => {
    const normalized = Math.min(1, Math.max(0, volume / 100));
    if (gainRef.current && audioCtxRef.current) {
      gainRef.current.gain.setValueAtTime(normalized, audioCtxRef.current.currentTime);
    }
    if (htmlAudioRef.current) {
      htmlAudioRef.current.volume = normalized;
    }
  }, [volume]);

  // Play a specific snippet length (Songspot B: skips dead air / silence at intro)
  const playSnippet = useCallback(
    (clipSeconds: number) => {
      const clampedClip = Math.min(
        MAX_SNIPPET_DURATION,
        Math.max(MIN_SNIPPET_DURATION, Number(clipSeconds) || MIN_SNIPPET_DURATION)
      );
      if (!bufferRef.current && !htmlAudioRef.current) {
        // In error or unloaded state, trigger recovery reload with autoplay
        loadAudio(true, clampedClip, false);
        return;
      }
      const introOffset = soundStartOffsetRef.current;
      startPlaybackFrom(introOffset, introOffset + clampedClip);
    },
    [startPlaybackFrom, loadAudio]
  );

  // Play or resume the full 30s preview (post-game reveal)
  const playFullPreview = useCallback(() => {
    const buffer = bufferRef.current;
    if (!buffer && !htmlAudioRef.current) {
      loadAudio(true, undefined, true);
      return;
    }
    const maxDur = Math.min(30, buffer ? buffer.duration : (htmlAudioRef.current?.duration || 30));
    const resumeFrom = offsetSecondsRef.current >= maxDur - 0.2 ? 0 : offsetSecondsRef.current;
    startPlaybackFrom(resumeFrom, maxDur);
  }, [startPlaybackFrom, loadAudio]);

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
    retry: () => loadAudio(false),
  };
}

