import { useCallback, useEffect, useRef, useState } from 'react';

export type AudioPlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

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
        bufferRef.current = decoded;
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
      startCtxTimeRef.current = now;
      setState('playing');

      const tick = () => {
        if (sourceRef.current !== source) return;
        const elapsedInRun = ctx.currentTime - now;
        const absolutePos = Math.min(cappedMax, safeOffset + elapsedInRun);
        setCurrentTime(absolutePos);
        setProgress(cappedMax > 0 ? Math.min(1, absolutePos / cappedMax) : 0);

        if (absolutePos < cappedMax) {
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

  // Play a specific snippet length from 0.0s (during active guessing round)
  const playSnippet = useCallback(
    (clipSeconds: number) => {
      startPlaybackFrom(0, clipSeconds);
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

