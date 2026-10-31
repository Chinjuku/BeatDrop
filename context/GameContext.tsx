'use client';
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import {
  Artist,
  CategoryType,
  DailyChallengeInfo,
  DEFAULT_TIME_STAGES,
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  GameConfig,
  GameMode,
  GuessHistoryItem,
  RoundActionResponse,
  RoundStartResponse,
  Song,
  TIME_RANGE_PRESETS,
  TimeRangePresetId,
} from '../types';
import { useTheme } from './ThemeContext';
import { useAudioController, AudioPlaybackState } from '../hooks/useAudioController';
import { useQuery } from '@tanstack/react-query';
import {
  QUERY_KEYS,
  invalidateArtists,
  invalidateDaily,
  invalidateSongs,
} from '../lib/queryClient';

const STORAGE_STREAK_KEY = 'songspot:streak';
const STORAGE_BEST_STREAK_KEY = 'songspot:best-streak';
const STORAGE_FASTEST_KEY = 'songspot:fastest-time';
const STORAGE_LOCAL_ARTISTS_KEY = 'songspot:custom-artists';
const STORAGE_TIME_PRESET_KEY = 'songspot:time-range-preset';
const STORAGE_CUSTOM_STAGES_KEY = 'songspot:custom-stages';

export interface ArtistSyncResult {
  artist: Artist;
  previousCount: number;
  newCount: number;
  added: number;
  fetched: number;
  message?: string;
}

export interface GameContextType {
  config: GameConfig;
  setConfig: React.Dispatch<React.SetStateAction<GameConfig>>;
  handleConfigChange: (nextCfg: GameConfig, startImmediately?: boolean) => void;
  handleCategoryChange: (cat: CategoryType) => void;
  handleDailyDifficultySelect: (difficulty: DifficultyLevel) => void;
  startNewRound: (activeCfg?: GameConfig) => Promise<void>;

  artists: Artist[];
  fetchArtists: () => Promise<void>;
  syncArtist: (payload: {
    id?: string;
    name: string;
    category?: 'thai' | 'international';
    mainGenre?: string;
    avatarUrl?: string;
  }) => Promise<ArtistSyncResult>;
  syncingArtistId: string | null;

  round: RoundStartResponse | null;
  loadingRound: boolean;
  outcome: 'correct' | 'failed' | null;
  revealSong: Song | null;
  history: GuessHistoryItem[];
  stages: number[];
  currentStage: number;
  activeClipSeconds: number;
  nextStageSeconds: number | null;

  streak: number;
  bestStreak: number;
  fastestTime: number | null;

  dailyInfo: DailyChallengeInfo | null;
  dailyIndex: number;
  dailyResults: Array<'correct' | 'failed' | 'pending'>;
  dailyScore: number;

  volume: number;
  setVolume: (val: number) => void;
  audioState: AudioPlaybackState;
  progress: number;
  currentTime: number;
  totalDuration: number;
  handleToggleSnippetPlay: () => void;
  handleToggleFullPreview: () => void;
  onSeek: (seconds: number) => void;

  handleSelectGuess: (selectedSong: Pick<Song, 'id' | 'title' | 'artistName'>) => Promise<void>;
  handleSkip: (giveUpDirectly?: boolean) => Promise<void>;
  handleNextRoundOrDaily: () => void;

  addArtistOpen: boolean;
  setAddArtistOpen: (val: boolean) => void;
  leaderboardOpen: boolean;
  setLeaderboardOpen: (val: boolean) => void;
  ticketModalOpen: boolean;
  setTicketModalOpen: (val: boolean) => void;
}

const GameContext = createContext<GameContextType | null>(null);

export const useGame = (): GameContextType => {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return ctx;
};

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { setActiveDifficulty } = useTheme();

  const [config, setConfig] = useState<GameConfig>(() => {
    let savedPreset: TimeRangePresetId = 'songspot';
    try {
      const p = localStorage.getItem(STORAGE_TIME_PRESET_KEY) as TimeRangePresetId | null;
      if (p && (p === 'relaxed' || p === 'standard' || p === 'songspot' || p === 'custom')) {
        savedPreset = p;
      }
    } catch {}

    let savedStages = DEFAULT_TIME_STAGES;
    try {
      const raw = localStorage.getItem(STORAGE_CUSTOM_STAGES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          savedStages = parsed;
        }
      }
    } catch {}

    const initialStages =
      savedPreset === 'custom'
        ? savedStages
        : (TIME_RANGE_PRESETS[savedPreset]?.stages || DEFAULT_TIME_STAGES);

    return {
      category: 'thai',
      difficulty: 'easy',
      mode: 'standard',
      yearFilter: 'any',
      genreFilter: 'any',
      timeRangePreset: savedPreset,
      customStages: initialStages,
    };
  });

  const [artists, setArtists] = useState<Artist[]>([]);
  const [syncingArtistId, setSyncingArtistId] = useState<string | null>(null);
  const [addArtistOpen, setAddArtistOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);

  // Daily Challenge State (5 deterministic songs per day)
  const [dailyInfo, setDailyInfo] = useState<DailyChallengeInfo | null>(null);
  const [dailyIndex, setDailyIndex] = useState<number>(0);
  const [dailyResults, setDailyResults] = useState<Array<'correct' | 'failed' | 'pending'>>([]);
  const [dailyScore, setDailyScore] = useState<number>(0);

  const [round, setRound] = useState<RoundStartResponse | null>(null);
  const [loadingRound, setLoadingRound] = useState(false);
  const [outcome, setOutcome] = useState<'correct' | 'failed' | null>(null);
  const [revealSong, setRevealSong] = useState<Song | null>(null);
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const [volume, setVolume] = useState<number>(85);
  const [playedIds, setPlayedIds] = useState<string[]>([]);
  const hasAutoPlayedRevealRef = useRef(false);

  // Player stats persisted in localStorage
  const [streak, setStreak] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(STORAGE_STREAK_KEY) || 0);
    } catch {
      return 0;
    }
  });
  const [bestStreak, setBestStreak] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(STORAGE_BEST_STREAK_KEY) || 0);
    } catch {
      return 0;
    }
  });
  const [fastestTime, setFastestTime] = useState<number | null>(() => {
    try {
      const val = localStorage.getItem(STORAGE_FASTEST_KEY);
      return val ? Number(val) : null;
    } catch {
      return null;
    }
  });

  const activeAudioUrl = revealSong?.previewUrl || round?.audioUrl || null;

  const {
    state: audioState,
    progress,
    currentTime,
    totalDuration,
    playSnippet,
    playFullPreview,
    pauseFullPreview,
    seekFullPreview,
    stop,
  } = useAudioController({
    audioUrl: activeAudioUrl,
    volume,
  });

  // Sync difficulty with ThemeContext
  useEffect(() => {
    setActiveDifficulty(config.difficulty);
  }, [config.difficulty, setActiveDifficulty]);

  // Sync timeRangePreset & customStages to localStorage
  useEffect(() => {
    try {
      if (config.timeRangePreset) {
        localStorage.setItem(STORAGE_TIME_PRESET_KEY, config.timeRangePreset);
      }
      if (config.customStages && config.customStages.length >= 2) {
        localStorage.setItem(STORAGE_CUSTOM_STAGES_KEY, JSON.stringify(config.customStages));
      }
    } catch {}
  }, [config.timeRangePreset, config.customStages]);

  // TanStack Query for Artists with real-time cache & invalidation
  const { data: queryArtists = [] } = useQuery<Artist[]>({
    queryKey: QUERY_KEYS.artists,
    queryFn: async () => {
      try {
        const res = await fetch('/api/artists');
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data)) {
          return json.data;
        }
      } catch {
        try {
          const local = JSON.parse(localStorage.getItem(STORAGE_LOCAL_ARTISTS_KEY) || '[]');
          if (Array.isArray(local)) return local;
        } catch {}
      }
      return [];
    },
    staleTime: 1000 * 60 * 2,
  });

  // Keep artists state synchronized with TanStack Query cache
  useEffect(() => {
    if (queryArtists && queryArtists.length > 0) {
      setArtists(queryArtists);
    }
  }, [queryArtists]);

  // Load artist pool from backend via TanStack Query invalidation
  const fetchArtists = useCallback(async () => {
    await invalidateArtists();
  }, []);

  // Unified Artist Add & Sync (up to 200 songs via /api/artists/sync)
  const syncArtist = useCallback(
    async (payload: {
      id?: string;
      name: string;
      category?: 'thai' | 'international';
      mainGenre?: string;
      avatarUrl?: string;
    }): Promise<ArtistSyncResult> => {
      const targetKey = payload.id || payload.name;
      setSyncingArtistId(targetKey);
      try {
        const res = await fetch('/api/artists/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            artistName: payload.name,
          }),
        });
        const json = await res.json();
        if (json.code !== 0 || !json.data) {
          throw new Error(json.message || 'ไม่สามารถดึงเพลงจากเซิร์ฟเวอร์ได้');
        }

        const syncedArtist: Artist = json.data.artist || json.data;
        const previousCount = Number(json.data.previousCount ?? 0);
        const newCount = Number(json.data.newCount ?? syncedArtist.trackCount ?? 0);
        const added = Number(json.data.added ?? Math.max(0, newCount - previousCount));
        const fetched = Number(json.data.fetched ?? newCount);

        // Update local state immediately so UI reflects new trackCount without waiting
        setArtists((prev) => {
          const idx = prev.findIndex(
            (a) =>
              a.id === syncedArtist.id ||
              a.name.toLowerCase() === syncedArtist.name.toLowerCase()
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...syncedArtist, trackCount: newCount };
            return next;
          }
          return [{ ...syncedArtist, trackCount: newCount }, ...prev];
        });

        await fetchArtists();
        await invalidateSongs();

        return {
          artist: { ...syncedArtist, trackCount: newCount },
          previousCount,
          newCount,
          added,
          fetched,
          message: json.message !== 'ok' ? json.message : undefined,
        };
      } finally {
        setSyncingArtistId(null);
      }
    },
    [fetchArtists]
  );

  // Start a new round
  const startNewRound = useCallback(
    async (activeCfg: GameConfig = config) => {
      stop();
      hasAutoPlayedRevealRef.current = false;
      setLoadingRound(true);
      setOutcome(null);
      setRevealSong(null);
      setHistory([]);

      try {
        const stagesParam =
          activeCfg.customStages && activeCfg.customStages.length >= 2
            ? activeCfg.customStages.join(',')
            : undefined;

        if (activeCfg.mode === 'daily') {
          const dailyParams = new URLSearchParams({
            category: activeCfg.category,
            difficulty: activeCfg.difficulty,
          });
          if (stagesParam) {
            dailyParams.set('customStages', stagesParam);
          }
          const res = await fetch(`/api/daily?${dailyParams.toString()}`);
          const json = await res.json();
          if (json.code === 0 && json.data) {
            const info: DailyChallengeInfo = json.data;
            setDailyInfo(info);
            setDailyIndex(0);
            setDailyResults(Array(info.rounds.length).fill('pending'));
            setDailyScore(0);
            setRound(info.rounds[0] || null);
          }
          return;
        }

        const params = new URLSearchParams({
          category: activeCfg.category,
          difficulty: activeCfg.difficulty,
          mode: activeCfg.mode,
        });
        if (stagesParam) {
          params.set('customStages', stagesParam);
        }
        if (activeCfg.artistName && activeCfg.artistName !== 'any') {
          params.set('artist', activeCfg.artistName);
        }
        if (activeCfg.yearFilter && activeCfg.yearFilter !== 'any') {
          params.set('year', activeCfg.yearFilter);
        }
        if (activeCfg.genreFilter && activeCfg.genreFilter !== 'any') {
          params.set('genre', activeCfg.genreFilter);
        }
        if (playedIds.length > 0) {
          params.set('exclude', playedIds.slice(-40).join(','));
        }

        const res = await fetch(`/api/songs?${params.toString()}`);
        const json = await res.json();
        if (json.code === 0 && json.data) {
          setRound(json.data);
        }
      } catch (err) {
        console.error('Failed to start round:', err);
      } finally {
        setLoadingRound(false);
      }
    },
    [config, playedIds, stop]
  );

  // Initial round start
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      startNewRound(config);
    }
  }, [config, startNewRound]);

  // Auto-play 30-second full preview once when round ends
  useEffect(() => {
    if (
      (outcome === 'correct' || outcome === 'failed') &&
      audioState === 'ready' &&
      !hasAutoPlayedRevealRef.current
    ) {
      hasAutoPlayedRevealRef.current = true;
      const timer = setTimeout(() => {
        playFullPreview();
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [outcome, audioState, playFullPreview]);

  const stages =
    round?.stages || config.customStages || DIFFICULTY_PRESETS[config.difficulty].stages;
  const currentStage = round?.stage ?? 0;
  const activeClipSeconds = stages[currentStage] || stages[0];

  // Toggle snippet play during active round
  const handleToggleSnippetPlay = useCallback(() => {
    if (!round) return;
    if (audioState === 'playing') {
      stop();
    } else {
      playSnippet(activeClipSeconds);
    }
  }, [round, audioState, stop, playSnippet, activeClipSeconds]);

  // Toggle 30s full preview during post-game reveal
  const handleToggleFullPreview = useCallback(() => {
    if (audioState === 'playing') {
      pauseFullPreview();
    } else {
      playFullPreview();
    }
  }, [audioState, pauseFullPreview, playFullPreview]);

  // Spacebar global shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (outcome) {
          handleToggleFullPreview();
        } else {
          handleToggleSnippetPlay();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [outcome, handleToggleFullPreview, handleToggleSnippetPlay]);

  // Handle Category change
  const handleCategoryChange = (cat: CategoryType) => {
    let nextArtist = config.artistName;
    if (nextArtist && cat !== 'all') {
      const currentArtistObj = artists.find(
        (a) => a.name.toLowerCase() === nextArtist?.toLowerCase()
      );
      if (currentArtistObj && currentArtistObj.category !== cat) {
        nextArtist = undefined;
      }
    }

    const nextCfg: GameConfig = {
      ...config,
      category: cat,
      artistName: nextArtist,
      ...(config.mode === 'artist' && !nextArtist ? { mode: 'standard' } : {}),
    };
    setConfig(nextCfg);
    startNewRound(nextCfg);
  };

  const handleConfigChange = (nextCfg: GameConfig, startImmediately = true) => {
    setConfig(nextCfg);
    if (startImmediately) {
      startNewRound(nextCfg);
    }
  };

  // Submit a song guess
  const handleSelectGuess = async (selectedSong: Pick<Song, 'id' | 'title' | 'artistName'>) => {
    if (!round || outcome) return;
    stop();

    try {
      const res = await fetch('/api/round/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundToken: round.roundToken,
          candidateTrackId: selectedSong.id,
          candidateTitle: selectedSong.title,
          candidateArtist: selectedSong.artistName,
        }),
      });
      const json = await res.json();
      if (json.code === 0 && json.data) {
        const data: RoundActionResponse = json.data;
        if (data.outcome === 'correct' && data.reveal) {
          setHistory((prev) => [
            ...prev,
            {
              trackId: selectedSong.id,
              title: selectedSong.title,
              artistName: selectedSong.artistName,
              stageIndex: currentStage,
              clipSeconds: activeClipSeconds,
              status: 'correct',
            },
          ]);
          setOutcome('correct');
          setRevealSong(data.reveal);
          setPlayedIds((prev) => [...prev, data.reveal!.id]);

          const newStreak = streak + 1;
          setStreak(newStreak);
          try {
            localStorage.setItem(STORAGE_STREAK_KEY, String(newStreak));
          } catch {}
          if (newStreak > bestStreak) {
            setBestStreak(newStreak);
            try {
              localStorage.setItem(STORAGE_BEST_STREAK_KEY, String(newStreak));
            } catch {}
          }
          if (fastestTime === null || activeClipSeconds < fastestTime) {
            setFastestTime(activeClipSeconds);
            try {
              localStorage.setItem(STORAGE_FASTEST_KEY, String(activeClipSeconds));
            } catch {}
          }

          if (config.mode === 'daily') {
            const roundPoints = Math.max(40, 200 - currentStage * 35);
            setDailyScore((s) => s + roundPoints);
            setDailyResults((prev) => {
              const next = [...prev];
              next[dailyIndex] = 'correct';
              return next;
            });
          }
        } else if (data.outcome === 'failed' && data.reveal) {
          setHistory((prev) => [
            ...prev,
            {
              trackId: selectedSong.id,
              title: selectedSong.title,
              artistName: selectedSong.artistName,
              stageIndex: currentStage,
              clipSeconds: activeClipSeconds,
              status: 'wrong',
            },
          ]);
          setOutcome('failed');
          setRevealSong(data.reveal);
          setPlayedIds((prev) => [...prev, data.reveal!.id]);
          setStreak(0);
          try {
            localStorage.setItem(STORAGE_STREAK_KEY, '0');
          } catch {}
          if (config.mode === 'daily') {
            setDailyResults((prev) => {
              const next = [...prev];
              next[dailyIndex] = 'failed';
              return next;
            });
          }
        } else if (data.outcome === 'active' && data.roundToken) {
          setHistory((prev) => [
            ...prev,
            {
              trackId: selectedSong.id,
              title: selectedSong.title,
              artistName: selectedSong.artistName,
              stageIndex: currentStage,
              clipSeconds: activeClipSeconds,
              status: 'wrong',
            },
          ]);
          setRound((prev) =>
            prev
              ? {
                  ...prev,
                  roundToken: data.roundToken!,
                  stage: data.stage,
                  clipSeconds: data.clipSeconds,
                }
              : prev
          );
        }
      }
    } catch (err) {
      console.error('Error submitting guess:', err);
    }
  };

  // Skip current clue or give up
  const handleSkip = async (giveUpDirectly = false) => {
    if (!round || outcome) return;
    stop();

    try {
      const res = await fetch('/api/round/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundToken: round.roundToken,
          giveUp: giveUpDirectly,
        }),
      });
      const json = await res.json();
      if (json.code === 0 && json.data) {
        const data: RoundActionResponse = json.data;
        if (data.outcome === 'failed' && data.reveal) {
          setHistory((prev) => [
            ...prev,
            {
              trackId: 'skipped',
              title: giveUpDirectly ? 'ยอมแพ้ (Give Up)' : 'ข้าม (Skipped)',
              artistName: '—',
              stageIndex: currentStage,
              clipSeconds: activeClipSeconds,
              status: 'skipped',
            },
          ]);
          setOutcome('failed');
          setRevealSong(data.reveal);
          setPlayedIds((prev) => [...prev, data.reveal!.id]);
          setStreak(0);
          try {
            localStorage.setItem(STORAGE_STREAK_KEY, '0');
          } catch {}
          if (config.mode === 'daily') {
            setDailyResults((prev) => {
              const next = [...prev];
              next[dailyIndex] = 'failed';
              return next;
            });
          }
        } else if (data.outcome === 'active' && data.roundToken) {
          setHistory((prev) => [
            ...prev,
            {
              trackId: 'skipped',
              title: 'ข้าม (Skipped)',
              artistName: '—',
              stageIndex: currentStage,
              clipSeconds: activeClipSeconds,
              status: 'skipped',
            },
          ]);
          setRound((prev) =>
            prev
              ? {
                  ...prev,
                  roundToken: data.roundToken!,
                  stage: data.stage,
                  clipSeconds: data.clipSeconds,
                }
              : prev
          );
        }
      }
    } catch (err) {
      console.error('Error skipping clue:', err);
    }
  };

  // Handle next round or next daily song
  const handleNextRoundOrDaily = () => {
    if (config.mode === 'daily' && dailyInfo) {
      const nextIdx = dailyIndex + 1;
      if (nextIdx < dailyInfo.rounds.length) {
        stop();
        hasAutoPlayedRevealRef.current = false;
        setOutcome(null);
        setRevealSong(null);
        setHistory([]);
        setDailyIndex(nextIdx);
        setRound(dailyInfo.rounds[nextIdx]);
      } else {
        setLeaderboardOpen(true);
      }
    } else {
      startNewRound(config);
    }
  };

  const handleDailyDifficultySelect = (difficulty: DifficultyLevel) => {
    if (config.difficulty === difficulty) return;
    const nextCfg: GameConfig = {
      ...config,
      difficulty,
    };
    setConfig(nextCfg);
    startNewRound(nextCfg);
  };

  const nextStageSeconds =
    currentStage + 1 < stages.length ? stages[currentStage + 1] : null;

  return (
    <GameContext.Provider
      value={{
        config,
        setConfig,
        handleConfigChange,
        handleCategoryChange,
        handleDailyDifficultySelect,
        startNewRound,

        artists,
        fetchArtists,
        syncArtist,
        syncingArtistId,

        round,
        loadingRound,
        outcome,
        revealSong,
        history,
        stages,
        currentStage,
        activeClipSeconds,
        nextStageSeconds,

        streak,
        bestStreak,
        fastestTime,

        dailyInfo,
        dailyIndex,
        dailyResults,
        dailyScore,

        volume,
        setVolume,
        audioState,
        progress,
        currentTime,
        totalDuration,
        handleToggleSnippetPlay,
        handleToggleFullPreview,
        onSeek: seekFullPreview,

        handleSelectGuess,
        handleSkip,
        handleNextRoundOrDaily,

        addArtistOpen,
        setAddArtistOpen,
        leaderboardOpen,
        setLeaderboardOpen,
        ticketModalOpen,
        setTicketModalOpen,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

