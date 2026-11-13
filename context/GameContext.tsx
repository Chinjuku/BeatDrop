'use client';
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
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
import { DailyChallengeLoadError, readDailyChallengeResponse } from '../shared/dailyChallengeClient';
import { useTheme } from './ThemeContext';
import { useAudioController, prefetchAudio, AudioPlaybackState } from '../hooks/useAudioController';
import { getCachedArtists, setCachedArtists, getCachedHistory, setCachedHistory } from '../lib/clientDb';
import { useQuery } from '@tanstack/react-query';
import {
  queryClient,
  QUERY_KEYS,
  invalidateArtists,
  invalidateDaily,
  invalidateSongs,
} from '../lib/queryClient';
import { getPreference, removePreference, setPreference } from '../lib/preferenceStorage';

const STORAGE_STREAK_KEY = 'songspot:streak';
const STORAGE_BEST_STREAK_KEY = 'songspot:best-streak';
const STORAGE_FASTEST_KEY = 'songspot:fastest-time';
const STORAGE_LOCAL_ARTISTS_KEY = 'songspot:custom-artists';
const STORAGE_TIME_PRESET_KEY = 'songspot:time-range-preset';
const STORAGE_CUSTOM_STAGES_KEY = 'songspot:custom-stages';
const STORAGE_DAILY_CATEGORY_KEY = 'songspot:daily-category';
const STORAGE_DAILY_DIFFICULTY_KEY = 'songspot:daily-difficulty';
const STORAGE_DAILY_ACTIVE_ROUND_KEY = 'songspot:daily-active-round';
const STORAGE_PLAYED_IDS_KEY = 'songspot:played-ids';
const MAX_PLAYED_HISTORY = 200;
const PLAYED_IDS_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface PlayedTrackEntry {
  id: string;
  ts: number;
}

function loadValidPlayedIds(): { ids: string[]; entries: PlayedTrackEntry[] } {
  const now = Date.now();
  try {
    const raw = getPreference(STORAGE_PLAYED_IDS_KEY);
    if (!raw) return { ids: [], entries: [] };
    const parsed = JSON.parse(raw);
    let rawEntries: PlayedTrackEntry[] = [];

    if (Array.isArray(parsed)) {
      rawEntries = parsed.map((item) =>
        typeof item === 'object' && item !== null && 'id' in item
          ? { id: String(item.id), ts: typeof item.ts === 'number' ? item.ts : now }
          : { id: String(item), ts: now }
      );
    } else if (parsed && Array.isArray(parsed.ids)) {
      const fallbackTs =
        typeof parsed.expiresAt === 'number' ? parsed.expiresAt - PLAYED_IDS_TTL_MS : now;
      rawEntries = parsed.ids.map((id: unknown) => ({ id: String(id), ts: fallbackTs }));
    }

    const validEntries = rawEntries
      .filter((e) => e.id && now - e.ts < PLAYED_IDS_TTL_MS)
      .slice(-MAX_PLAYED_HISTORY);

    if (validEntries.length === 0) {
      removePreference(STORAGE_PLAYED_IDS_KEY);
      return { ids: [], entries: [] };
    }
    if (validEntries.length !== rawEntries.length) {
      setPreference(STORAGE_PLAYED_IDS_KEY, JSON.stringify(validEntries));
    }
    return { ids: validEntries.map((e) => e.id), entries: validEntries };
  } catch {}
  return { ids: [], entries: [] };
}

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
  retryRound: () => Promise<void>;

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
  submittingGuess: boolean;
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
  dailyLoadError: string | null;
  retryDailyChallenge: () => Promise<void>;
  roundLoadError: string | null;
  dailyIndex: number;
  dailyResults: Array<'correct' | 'wrong' | 'skipped' | 'expired' | 'pending'>;
  dailyScore: number;
  dailyCorrectCount: number;
  dailySkipCount: number;
  dailyTotalAnswerTimeMs: number;
  dailyFeedback: Pick<RoundActionResponse, 'dailyResult' | 'scoreDelta' | 'speedBonus' | 'elapsedTimeMs'> | null;
  guesserSkipCount: number;
  guesserFeedback: string | null;

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
  handleGuesserSkip: () => Promise<void>;
  handleDailyTimeout: () => Promise<void>;
  handleNextRoundOrDaily: () => Promise<void>;

  addArtistOpen: boolean;
  setAddArtistOpen: (val: boolean) => void;
  leaderboardOpen: boolean;
  setLeaderboardOpen: (val: boolean) => void;
  ticketModalOpen: boolean;
  setTicketModalOpen: (val: boolean) => void;
}

export interface AudioProgressContextType {
  progress: number;
  currentTime: number;
  totalDuration: number;
}

const AudioProgressContext = createContext<AudioProgressContextType | null>(null);

export const useAudioProgress = (): AudioProgressContextType | null => {
  return useContext(AudioProgressContext);
};

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

  const [config, setConfig] = useState<GameConfig>({
    category: 'thai',
    difficulty: 'easy',
    mode: 'standard',
    yearFilter: 'any',
    genreFilter: 'any',
    timeRangePreset: 'standard',
    customStages: DEFAULT_TIME_STAGES,
  });

  const [artists, setArtists] = useState<Artist[]>([]);
  const [syncingArtistId, setSyncingArtistId] = useState<string | null>(null);
  const [addArtistOpen, setAddArtistOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);

  // Daily Challenge State (5 deterministic songs per day)
  const [dailyInfo, setDailyInfo] = useState<DailyChallengeInfo | null>(null);
  const [dailyLoadError, setDailyLoadError] = useState<string | null>(null);
  const [dailyIndex, setDailyIndex] = useState<number>(0);
  const [dailyResults, setDailyResults] = useState<Array<'correct' | 'wrong' | 'skipped' | 'expired' | 'pending'>>([]);
  const [dailyScore, setDailyScore] = useState<number>(0);
  const [dailyCorrectCount, setDailyCorrectCount] = useState(0);
  const [dailySkipCount, setDailySkipCount] = useState(0);
  const [dailyTotalAnswerTimeMs, setDailyTotalAnswerTimeMs] = useState(0);
  const [dailyFeedback, setDailyFeedback] = useState<GameContextType['dailyFeedback']>(null);
  const [guesserSkipCount, setGuesserSkipCount] = useState(0);
  const [guesserFeedback, setGuesserFeedback] = useState<string | null>(null);

  const [round, setRound] = useState<RoundStartResponse | null>(null);
  const [loadingRound, setLoadingRound] = useState(false);
  const [roundLoadError, setRoundLoadError] = useState<string | null>(null);
  const [submittingGuess, setSubmittingGuess] = useState(false);
  const [outcome, setOutcome] = useState<'correct' | 'failed' | null>(null);
  const [revealSong, setRevealSong] = useState<Song | null>(null);
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const [volume, setVolume] = useState<number>(85);
  const [playedIds, setPlayedIds] = useState<string[]>([]);
  const playedIdsRef = useRef<string[]>([]);
  const hasAutoPlayedRevealRef = useRef(false);
  const roundAbortControllerRef = useRef<AbortController | null>(null);
  const inFlightRoundSigRef = useRef<string | null>(null);
  const lastRoundStartRef = useRef<number>(0);
  const roundActionLockRef = useRef(false);

  const recordPlayedTrack = useCallback((trackId: string) => {
    if (!trackId) return;
    const idStr = String(trackId);
    const now = Date.now();
    const { entries } = loadValidPlayedIds();
    const nextEntries = [...entries.filter((e) => e.id !== idStr), { id: idStr, ts: now }].slice(
      -MAX_PLAYED_HISTORY
    );
    const nextIds = nextEntries.map((e) => e.id);
    playedIdsRef.current = nextIds;
    setPlayedIds(nextIds);
    try {
      setPreference(STORAGE_PLAYED_IDS_KEY, JSON.stringify(nextEntries));
    } catch {}
  }, []);

  // Player stats persisted in localStorage (hydrated on client mount to prevent SSR mismatch)
  const [streak, setStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(0);
  const [fastestTime, setFastestTime] = useState<number | null>(null);

  // Safe client hydration from localStorage
  useEffect(() => {
    try {
      const s = Number(getPreference(STORAGE_STREAK_KEY) || 0);
      const bs = Number(getPreference(STORAGE_BEST_STREAK_KEY) || 0);
      const ft = getPreference(STORAGE_FASTEST_KEY);
      if (s) setStreak(s);
      if (bs) setBestStreak(bs);
      if (ft) setFastestTime(Number(ft));

      const { ids: validPlayed } = loadValidPlayedIds();
      playedIdsRef.current = validPlayed;
      setPlayedIds(validPlayed);

      const p = getPreference(STORAGE_TIME_PRESET_KEY) as TimeRangePresetId | null;
      let savedStages = DEFAULT_TIME_STAGES;
      const raw = getPreference(STORAGE_CUSTOM_STAGES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          savedStages = parsed;
        }
      }
      if (p && (p === 'relaxed' || p === 'standard' || p === 'songspot' || p === 'custom')) {
        const stages =
          p === 'custom' ? savedStages : (TIME_RANGE_PRESETS[p]?.stages || DEFAULT_TIME_STAGES);
        setConfig((prev) => ({
          ...prev,
          timeRangePreset: p,
          customStages: stages,
        }));
      }

      // Restore last selected Daily Challenge mode (category & difficulty)
      const savedDailyCat = getPreference(STORAGE_DAILY_CATEGORY_KEY) as CategoryType | null;
      const savedDailyDiff = getPreference(STORAGE_DAILY_DIFFICULTY_KEY) as DifficultyLevel | null;
      const validCategories = new Set<CategoryType>(['thai', 'international', 'all']);
      const validDifficulties = new Set<DifficultyLevel>(['easy', 'medium', 'hard', 'expert', 'impossible']);
      if (
        (savedDailyCat && validCategories.has(savedDailyCat)) ||
        (savedDailyDiff && validDifficulties.has(savedDailyDiff))
      ) {
        setConfig((prev) => ({
          ...prev,
          category: savedDailyCat && validCategories.has(savedDailyCat) ? savedDailyCat : prev.category,
          difficulty: savedDailyDiff && validDifficulties.has(savedDailyDiff) ? savedDailyDiff : prev.difficulty,
        }));
      }
    } catch {}
  }, []);

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
    if (config.mode === 'daily') {
      try {
        setPreference(STORAGE_DAILY_DIFFICULTY_KEY, config.difficulty);
        setPreference(STORAGE_DAILY_CATEGORY_KEY, config.category);
      } catch {}
    }
  }, [config.difficulty, config.category, config.mode, setActiveDifficulty]);

  // Sync timeRangePreset & customStages to localStorage
  useEffect(() => {
    try {
      if (config.timeRangePreset) {
        setPreference(STORAGE_TIME_PRESET_KEY, config.timeRangePreset);
      }
      if (config.customStages && config.customStages.length >= 2) {
        setPreference(STORAGE_CUSTOM_STAGES_KEY, JSON.stringify(config.customStages));
      }
    } catch {}
  }, [config.timeRangePreset, config.customStages]);

  // TanStack Query for Artists with real-time cache & optimistic local merge
  const { data: queryArtists = [] } = useQuery<Artist[]>({
    queryKey: QUERY_KEYS.artists,
    queryFn: async () => {
      let localCustom: Artist[] = [];
      try {
        const parsed = JSON.parse(getPreference(STORAGE_LOCAL_ARTISTS_KEY) || '[]');
        if (Array.isArray(parsed)) localCustom = parsed;
      } catch {}

      try {
        const res = await fetch('/api/artists');
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data)) {
          const merged: Artist[] = [...json.data];
          for (const local of localCustom) {
            const idx = merged.findIndex(
              (a) =>
                a.id === local.id ||
                a.name.trim().toLowerCase() === local.name.trim().toLowerCase()
            );
            if (idx >= 0) {
              merged[idx] = {
                ...local,
                ...merged[idx],
                avatarUrl: merged[idx].avatarUrl || local.avatarUrl,
                trackCount: Math.max(merged[idx].trackCount || 0, local.trackCount || 0),
              };
            } else {
              merged.unshift(local);
            }
          }
          return merged;
        }
      } catch {}
      return localCustom;
    },
    staleTime: 1000 * 60 * 2,
  });

  // Phase 2: Instant offline mount from browser IndexedDB
  useEffect(() => {
    getCachedArtists().then((cached) => {
      if (cached && cached.length > 0 && artists.length === 0) {
        setArtists(cached);
      }
    });
  }, [artists.length]);

  // Keep artists state synchronized with TanStack Query cache and persist to IndexedDB
  useEffect(() => {
    if (queryArtists && queryArtists.length > 0) {
      setArtists(queryArtists);
      setCachedArtists(queryArtists).catch(() => {});
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
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (typeof window !== 'undefined') {
          const adminKey = sessionStorage.getItem('beatdrop_admin_key');
          if (adminKey) headers['x-admin-key'] = adminKey;
        }

        const res = await fetch('/api/artists/sync', {
          method: 'POST',
          headers,
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
        const added = Number(
          json.data.added ?? json.data.addedCount ?? Math.max(0, newCount - previousCount)
        );
        const fetched = Number(json.data.fetched ?? json.data.totalFetched ?? newCount);
        const updatedArtist: Artist = { ...syncedArtist, trackCount: newCount };

        // 0. Persist into localStorage custom artists so background refetches never drop it
        try {
          const rawLocal = JSON.parse(getPreference(STORAGE_LOCAL_ARTISTS_KEY) || '[]');
          const localList: Artist[] = Array.isArray(rawLocal) ? rawLocal : [];
          const lIdx = localList.findIndex(
            (a) =>
              a.id === updatedArtist.id ||
              a.name.trim().toLowerCase() === updatedArtist.name.trim().toLowerCase()
          );
          if (lIdx >= 0) {
            localList[lIdx] = { ...localList[lIdx], ...updatedArtist };
          } else {
            localList.unshift(updatedArtist);
          }
          setPreference(STORAGE_LOCAL_ARTISTS_KEY, JSON.stringify(localList.slice(0, 100)));
        } catch {}

        // 1. Optimistic update: set TanStack Query cache directly (0ms instant UI, no overwrite flicker)
        queryClient.setQueryData<Artist[]>(QUERY_KEYS.artists, (old = []) => {
          const idx = old.findIndex(
            (a) =>
              a.id === updatedArtist.id ||
              a.name.toLowerCase() === updatedArtist.name.toLowerCase()
          );
          if (idx >= 0) {
            const next = [...old];
            next[idx] = { ...next[idx], ...updatedArtist };
            return next;
          }
          return [updatedArtist, ...old];
        });

        // 2. Update local state immediately so UI reflects new trackCount without waiting
        setArtists((prev) => {
          const idx = prev.findIndex(
            (a) =>
              a.id === updatedArtist.id ||
              a.name.toLowerCase() === updatedArtist.name.toLowerCase()
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...updatedArtist };
            return next;
          }
          return [updatedArtist, ...prev];
        });

        // 3. Persist to IndexedDB cache
        getCachedArtists().then((cached) => {
          const list = cached || [];
          const idx = list.findIndex(
            (a) =>
              a.id === updatedArtist.id ||
              a.name.toLowerCase() === updatedArtist.name.toLowerCase()
          );
          const next = idx >= 0 ? [...list] : [updatedArtist, ...list];
          if (idx >= 0) next[idx] = { ...next[idx], ...updatedArtist };
          setCachedArtists(next).catch(() => {});
        });

        // 4. Invalidate songs in background without blocking button or overwriting optimistic artist state
        void invalidateSongs();

        return {
          artist: updatedArtist,
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
    async (activeCfg: GameConfig = config, force = false) => {
      const roundSig = JSON.stringify({
        mode: activeCfg.mode,
        category: activeCfg.category,
        difficulty: activeCfg.difficulty,
        artist: activeCfg.artistName || '',
        year: activeCfg.yearFilter || 'any',
        genre: activeCfg.genreFilter || 'any',
        stages: activeCfg.customStages || [],
      });

      // Deduplicate identical in-flight round starts (prevents mount double-fetch)
      if (!force && roundAbortControllerRef.current && inFlightRoundSigRef.current === roundSig) {
        return;
      }

      // Cooldown throttle: prevent double-clicks within 600ms (bypass when config signature changes)
      const now = Date.now();
      const isConfigChange = inFlightRoundSigRef.current !== roundSig;
      if (!force && !isConfigChange && now - lastRoundStartRef.current < 600) {
        return;
      }
      lastRoundStartRef.current = now;
      inFlightRoundSigRef.current = roundSig;

      // Abort previous in-flight round requests to avoid race conditions
      if (roundAbortControllerRef.current) {
        roundAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      roundAbortControllerRef.current = controller;

      stop();
      hasAutoPlayedRevealRef.current = false;
      setLoadingRound(true);
      if (activeCfg.mode === 'daily' || activeCfg.mode === 'guesser') setRound(null);
      setOutcome(null);
      setRevealSong(null);
      setHistory([]);
      setRoundLoadError(null);
      if (activeCfg.mode === 'guesser') setGuesserFeedback(null);

      let dailyRequestTimedOut = false;
      let dailyRequestTimeoutId: number | undefined;
      let failedRequest: { endpoint?: string; status?: number; apiCode?: unknown; apiMessage?: string } = {};
      try {
        const stagesParam =
          activeCfg.customStages && activeCfg.customStages.length >= 2
            ? activeCfg.customStages.join(',')
            : undefined;

        if (activeCfg.mode === 'daily') {
          setDailyLoadError(null);
          setDailyInfo(null);
          setDailyResults([]);
          setDailyScore(0);
          setDailyCorrectCount(0);
          setDailySkipCount(0);
          setDailyTotalAnswerTimeMs(0);
          const dailyParams = new URLSearchParams({
            category: activeCfg.category,
            difficulty: activeCfg.difficulty,
          });
          dailyRequestTimeoutId = window.setTimeout(() => {
            dailyRequestTimedOut = true;
            controller.abort();
          }, 12_000);
          const res = await fetch(`/api/daily?${dailyParams.toString()}`, {
            signal: controller.signal,
          });
          failedRequest = { endpoint: '/api/daily', status: res.status };
          const info = await readDailyChallengeResponse(res);
          if (dailyRequestTimeoutId !== undefined) window.clearTimeout(dailyRequestTimeoutId);
          dailyRequestTimeoutId = undefined;
          setDailyInfo(info);
          setDailyIndex(info.currentIndex);
          setDailyResults(info.results);
          setDailyScore(info.score);
          setDailyCorrectCount(info.correctCount);
          setDailySkipCount(info.skipCount);
          setDailyTotalAnswerTimeMs(info.totalAnswerTimeMs);
          setDailyFeedback(null);
          setRound(info.currentIndex < info.rounds.length ? info.rounds[info.currentIndex] : null);
          setOutcome(null);
          setRevealSong(null);

          // Restore mid-round stage and history if player refreshed during active daily song
          if (info.currentIndex < info.rounds.length) {
            try {
              const activeKey = `${info.dateKey}::${info.category}::${info.difficulty || activeCfg.difficulty}::${info.currentIndex}`;
              const savedMidRound =
                sessionStorage.getItem(STORAGE_DAILY_ACTIVE_ROUND_KEY) ||
                getPreference(STORAGE_DAILY_ACTIVE_ROUND_KEY);
              if (savedMidRound) {
                const parsed = JSON.parse(savedMidRound);
                if (parsed?.key === activeKey && parsed.roundToken && Array.isArray(parsed.history)) {
                  setRound((prev) => (prev ? {
                    ...prev,
                    roundToken: parsed.roundToken,
                    stage: parsed.stage ?? prev.stage,
                    clipSeconds: parsed.clipSeconds ?? prev.clipSeconds,
                  } : prev));
                  setHistory(parsed.history);
                } else {
                  sessionStorage.removeItem(STORAGE_DAILY_ACTIVE_ROUND_KEY);
                  removePreference(STORAGE_DAILY_ACTIVE_ROUND_KEY);
                }
              }
            } catch {}
          } else {
            try {
              sessionStorage.removeItem(STORAGE_DAILY_ACTIVE_ROUND_KEY);
              removePreference(STORAGE_DAILY_ACTIVE_ROUND_KEY);
            } catch {}
          }

          if (info.currentIndex + 1 < info.rounds.length && info.rounds[info.currentIndex + 1]?.audioUrl) {
            prefetchAudio(info.rounds[info.currentIndex + 1].audioUrl);
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
        const { ids: currentExcluded } = loadValidPlayedIds();
        playedIdsRef.current = currentExcluded;
        if (currentExcluded.length > 0) {
          params.set('exclude', currentExcluded.slice(-150).join(','));
        }

        const res = await fetch(`/api/songs?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = await res.json().catch(() => null);
        failedRequest = {
          endpoint: '/api/songs',
          status: res.status,
          apiCode: json?.code,
          apiMessage: typeof json?.message === 'string' ? json.message : undefined,
        };
        if (!res.ok || json?.code !== 0 || !json?.data) {
          throw new Error('Round request failed');
        }
        if (activeCfg.mode === 'guesser' && (!Array.isArray(json.data.choices) || json.data.choices.length !== 4)) {
          throw new Error('Invalid Song Guesser round');
        }
        setRound(json.data);
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError' && !dailyRequestTimedOut) return;
        if (activeCfg.mode === 'daily') {
          setDailyLoadError('Daily Challenge could not be loaded. Check your connection and retry.');
        } else if (activeCfg.mode === 'guesser') {
          setRoundLoadError('Could not load the next song. Check your connection and retry.');
        }
        if (err instanceof DailyChallengeLoadError) {
          failedRequest.status = err.status;
          failedRequest.apiCode = err.apiCode;
          failedRequest.apiMessage = err.apiMessage;
        }
        console.error('[Game] Failed to start round', JSON.stringify({
          mode: activeCfg.mode,
          errorType: err instanceof Error ? err.name : 'unknown',
          errorMessage: err instanceof Error ? err.message : String(err),
          ...failedRequest,
        }));
      } finally {
        if (dailyRequestTimeoutId !== undefined) window.clearTimeout(dailyRequestTimeoutId);
        if (roundAbortControllerRef.current === controller) {
          roundAbortControllerRef.current = null;
          setLoadingRound(false);
        }
      }
    },
    [config, playedIds, stop]
  );

  // Ensure initial hydration of playedIdsRef happens before first round start
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      const { ids: validPlayed } = loadValidPlayedIds();
      playedIdsRef.current = validPlayed;
      const path = typeof window !== 'undefined' ? window.location.pathname : '/';
      if (path.startsWith('/categories') || path.startsWith('/admin')) {
        return;
      }
      const initialMode: GameMode = path.startsWith('/daily')
        ? 'daily'
        : path.startsWith('/guesser')
        ? 'guesser'
        : config.mode;
      let initialCfg = initialMode !== config.mode
        ? {
            ...config,
            mode: initialMode,
          }
        : config;
      if (initialMode === 'daily') {
        const savedDailyCat = getPreference(STORAGE_DAILY_CATEGORY_KEY) as CategoryType | null;
        const savedDailyDiff = getPreference(STORAGE_DAILY_DIFFICULTY_KEY) as DifficultyLevel | null;
        const validCategories = new Set<CategoryType>(['thai', 'international', 'all']);
        const validDifficulties = new Set<DifficultyLevel>(['easy', 'medium', 'hard', 'expert', 'impossible']);
        initialCfg = {
          ...initialCfg,
          category: savedDailyCat && validCategories.has(savedDailyCat) ? savedDailyCat : initialCfg.category,
          difficulty: savedDailyDiff && validDifficulties.has(savedDailyDiff) ? savedDailyDiff : initialCfg.difficulty,
        };
      }
      if (initialCfg !== config) {
        setConfig(initialCfg);
      }
      if (!roundAbortControllerRef.current) {
        startNewRound(initialCfg);
      }
    }
  }, [config, startNewRound]);

  const retryDailyChallenge = useCallback(async () => {
    if (config.mode === 'daily') await startNewRound(config, true);
  }, [config, startNewRound]);
  const retryRound = useCallback(async () => {
    await startNewRound(config, true);
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

  const handleConfigChange = useCallback((nextCfg: GameConfig, startImmediately = true) => {
    setConfig(nextCfg);
    if (startImmediately) {
      startNewRound(nextCfg);
    }
  }, [startNewRound]);

  const applyDailyResult = (data: RoundActionResponse) => {
    if (!data.dailyResult) return;
    setDailyFeedback({
      dailyResult: data.dailyResult,
      scoreDelta: data.scoreDelta,
      speedBonus: data.speedBonus,
      elapsedTimeMs: data.elapsedTimeMs,
    });
    setDailyResults((prev) => {
      const next = [...prev];
      next[dailyIndex] = data.dailyResult!;
      return next;
    });
    setDailyScore((prev) => Math.max(0, prev + (data.scoreDelta || 0)));
    setDailyCorrectCount((prev) => prev + (data.dailyResult === 'correct' ? 1 : 0));
    setDailySkipCount((prev) => prev + (data.dailyResult === 'skipped' ? 1 : 0));
    setDailyTotalAnswerTimeMs((prev) => prev + (data.elapsedTimeMs || 0));
    try {
      sessionStorage.removeItem(STORAGE_DAILY_ACTIVE_ROUND_KEY);
      removePreference(STORAGE_DAILY_ACTIVE_ROUND_KEY);
    } catch {}
  };

  // Submit a song guess
  const handleSelectGuess = async (selectedSong: Pick<Song, 'id' | 'title' | 'artistName'>) => {
    if (!round || outcome || submittingGuess || roundActionLockRef.current) return;
    roundActionLockRef.current = true;
    stop();
    if (config.mode === 'daily') setDailyFeedback(null);
    if (config.mode === 'guesser') setGuesserFeedback(null);
    setSubmittingGuess(true);

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
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.code !== 0 || !json.data) {
        const serverMessage = typeof json?.message === 'string' ? ` ${json.message}` : '';
        if (config.mode === 'guesser') {
          setGuesserFeedback(`Could not check that answer. Please try again.${serverMessage}`);
        }
        console.warn('[Game] Guess request was rejected', {
          mode: config.mode,
          status: res.status,
          code: json?.code,
        });
        return;
      }
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
          if (data.reveal.previewUrl) prefetchAudio(data.reveal.previewUrl);
          recordPlayedTrack(data.reveal.id);

          const newStreak = streak + 1;
          setStreak(newStreak);
          try {
            setPreference(STORAGE_STREAK_KEY, String(newStreak));
          } catch {}
          if (newStreak > bestStreak) {
            setBestStreak(newStreak);
            try {
              setPreference(STORAGE_BEST_STREAK_KEY, String(newStreak));
            } catch {}
          }
          if (fastestTime === null || activeClipSeconds < fastestTime) {
            setFastestTime(activeClipSeconds);
            try {
              setPreference(STORAGE_FASTEST_KEY, String(activeClipSeconds));
            } catch {}
          }

          if (config.mode === 'daily') applyDailyResult(data);
        } else if (data.outcome === 'failed' && data.reveal) {
          setHistory((prev) => [
            ...prev,
            {
              trackId: selectedSong.id,
              title: selectedSong.title,
              artistName: selectedSong.artistName,
              stageIndex: currentStage,
              clipSeconds: activeClipSeconds,
              status: data.roundResult === 'skipped' ? 'skipped' : 'wrong',
            },
          ]);
          setOutcome('failed');
          setRevealSong(data.reveal);
          if (data.reveal.previewUrl) prefetchAudio(data.reveal.previewUrl);
          recordPlayedTrack(data.reveal.id);
          setStreak(0);
          try {
            setPreference(STORAGE_STREAK_KEY, '0');
          } catch {}
          if (config.mode === 'daily') applyDailyResult(data);
        } else if (data.outcome === 'active' && data.roundToken) {
          if (config.mode === 'daily') {
            setDailyFeedback({ dailyResult: 'wrong', scoreDelta: 0, speedBonus: 0 });
          }
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
          setRound((prev) => {
            const nextRound = prev
              ? {
                  ...prev,
                  roundToken: data.roundToken!,
                  stage: data.stage,
                  clipSeconds: data.clipSeconds,
                }
              : prev;
            if (config.mode === 'daily' && dailyInfo) {
              try {
                const activeKey = `${dailyInfo.dateKey}::${dailyInfo.category}::${dailyInfo.difficulty || config.difficulty}::${dailyIndex}`;
                const payload = JSON.stringify({
                  key: activeKey,
                  roundToken: data.roundToken,
                  stage: data.stage,
                  clipSeconds: data.clipSeconds,
                  history: [
                    ...history,
                    {
                      trackId: selectedSong.id,
                      title: selectedSong.title,
                      artistName: selectedSong.artistName,
                      stageIndex: currentStage,
                      clipSeconds: activeClipSeconds,
                      status: 'wrong',
                    },
                  ],
                });
                sessionStorage.setItem(STORAGE_DAILY_ACTIVE_ROUND_KEY, payload);
                setPreference(STORAGE_DAILY_ACTIVE_ROUND_KEY, payload);
              } catch {}
            }
            return nextRound;
          });
        }
      }
    } catch (err) {
      console.error('[Game] Error submitting guess:', err);
      if (config.mode === 'guesser') {
        setGuesserFeedback('Could not check that answer. Check your connection and try again.');
      }
    } finally {
      roundActionLockRef.current = false;
      setSubmittingGuess(false);
    }
  };

  // Skip current clue or give up
  const handleSkip = async (giveUpDirectly = false) => {
    if (!round || outcome || submittingGuess || roundActionLockRef.current) return;
    roundActionLockRef.current = true;
    stop();
    setSubmittingGuess(true);

    try {
      const res = await fetch('/api/round/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundToken: round.roundToken,
          giveUp: giveUpDirectly,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.code !== 0 || !json?.data) {
        if (config.mode === 'guesser') {
          const detail = typeof json?.message === 'string' ? ` ${json.message}` : '';
          setGuesserFeedback(`Skip could not be recorded. Please retry.${detail}`);
        }
        console.warn('[Game] Skip request was rejected', { mode: config.mode, status: res.status, code: json?.code });
        return;
      }
      if (json.code === 0 && json.data) {
        const data: RoundActionResponse = json.data;
        if ((data.outcome === 'failed' || data.outcome === 'correct') && data.reveal) {
          const resultStatus = data.roundResult === 'correct'
            ? 'correct'
            : data.roundResult === 'skipped' ? 'skipped' : 'wrong';
          setHistory((prev) => [
            ...prev,
            {
              trackId: data.reveal!.id,
              title: data.reveal!.title,
              artistName: data.reveal!.artistName,
              stageIndex: currentStage,
              clipSeconds: activeClipSeconds,
              status: resultStatus,
            },
          ]);
          setOutcome(data.outcome === 'correct' ? 'correct' : 'failed');
          setRevealSong(data.reveal);
          if (data.reveal.previewUrl) prefetchAudio(data.reveal.previewUrl);
          recordPlayedTrack(data.reveal.id);
          if (config.mode === 'guesser' && resultStatus === 'skipped') {
            setGuesserSkipCount((count) => count + 1);
            setGuesserFeedback('ข้ามแล้ว · ไม่ได้คะแนน');
          }
          if (resultStatus !== 'correct') {
            setStreak(0);
            try {
              setPreference(STORAGE_STREAK_KEY, '0');
            } catch {}
          }
          if (config.mode === 'daily') applyDailyResult(data);
        } else if (data.outcome === 'active' && data.roundToken) {
          setHistory((prev) => [
            ...prev,
            {
              trackId: 'skipped',
              title: 'ข้าม',
              artistName: '—',
              stageIndex: currentStage,
              clipSeconds: activeClipSeconds,
              status: 'skipped',
            },
          ]);
          setRound((prev) => {
            const nextRound = prev
              ? {
                  ...prev,
                  roundToken: data.roundToken!,
                  stage: data.stage,
                  clipSeconds: data.clipSeconds,
                }
              : prev;
            if (config.mode === 'daily' && dailyInfo) {
              try {
                const activeKey = `${dailyInfo.dateKey}::${dailyInfo.category}::${dailyInfo.difficulty || config.difficulty}::${dailyIndex}`;
                const payload = JSON.stringify({
                  key: activeKey,
                  roundToken: data.roundToken,
                  stage: data.stage,
                  clipSeconds: data.clipSeconds,
                  history: [
                    ...history,
                    {
                      trackId: 'skipped',
                      title: 'ข้าม',
                      artistName: '—',
                      stageIndex: currentStage,
                      clipSeconds: activeClipSeconds,
                      status: 'skipped',
                    },
                  ],
                });
                sessionStorage.setItem(STORAGE_DAILY_ACTIVE_ROUND_KEY, payload);
                setPreference(STORAGE_DAILY_ACTIVE_ROUND_KEY, payload);
              } catch {}
            }
            return nextRound;
          });
        }
      }
    } catch (err) {
      console.error('Error skipping clue:', err);
    } finally {
      roundActionLockRef.current = false;
      setSubmittingGuess(false);
    }
  };

  const handleGuesserSkip = async () => {
    if (config.mode !== 'guesser') return;
    await handleSkip(false);
  };

  const handleDailyTimeout = async () => {
    if (config.mode !== 'daily' || !round || outcome || submittingGuess || roundActionLockRef.current) return;
    roundActionLockRef.current = true;
    stop();
    setSubmittingGuess(true);
    try {
      const res = await fetch('/api/daily/expire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundToken: round.roundToken }),
      });
      const json = await res.json();
      if (json.code === 0 && json.data) {
        const data: RoundActionResponse = json.data;
        setOutcome('failed');
        setRevealSong(data.reveal || null);
        setHistory([]);
        applyDailyResult(data);
      }
    } catch (err) {
      console.error('Error expiring Daily Challenge round:', err);
    } finally {
      roundActionLockRef.current = false;
      setSubmittingGuess(false);
    }
  };

  // Handle next round or next daily song
  const handleNextRoundOrDaily = async () => {
    if (config.mode === 'daily' && dailyInfo) {
      const nextIdx = dailyIndex + 1;
      if (nextIdx < dailyInfo.totalRounds) {
        stop();
        hasAutoPlayedRevealRef.current = false;
        setOutcome(null);
        setRevealSong(null);
        setHistory([]);
        setRound(null);
        setDailyLoadError(null);
        setLoadingRound(true);
        try {
          const res = await fetch('/api/daily/round', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roundIndex: nextIdx,
              category: dailyInfo.category,
              difficulty: config.difficulty,
              dateKey: dailyInfo.dateKey,
            }),
          });
          const json = await res.json();
          if (!res.ok || json.code !== 0 || !json.data) {
            throw new Error('Daily round request failed');
          }
          setDailyIndex(nextIdx);
          setRound(json.data as RoundStartResponse);
          setDailyFeedback(null);
        } catch (err) {
          setDailyLoadError('Daily Challenge could not be loaded. Check your connection and retry.');
          console.warn('[Daily] Could not start the next round', {
            errorType: err instanceof Error ? err.name : 'unknown',
          });
        } finally {
          setLoadingRound(false);
        }
      } else {
        stop();
        hasAutoPlayedRevealRef.current = false;
        setOutcome(null);
        setRevealSong(null);
        setHistory([]);
        setDailyIndex(dailyInfo.rounds.length);
        setLeaderboardOpen(true);
      }
    } else {
      startNewRound(config);
    }
  };

  // Shared by Daily Challenge and Song Guesser difficulty tabs
  const handleDailyDifficultySelect = (difficulty: DifficultyLevel) => {
    if (config.difficulty === difficulty) return;
    const nextCfg = { ...config, difficulty };
    setConfig(nextCfg);
    void startNewRound(nextCfg);
  };

  const nextStageSeconds =
    currentStage + 1 < stages.length ? stages[currentStage + 1] : null;

  const audioProgressValue = useMemo<AudioProgressContextType>(
    () => ({
      progress,
      currentTime,
      totalDuration,
    }),
    [progress, currentTime, totalDuration]
  );

  // Exclude 60fps `progress` and `currentTime` from GameContext dependencies so
  // `useGame()` consumers do not re-render on every requestAnimationFrame tick.
  const gameContextValue = useMemo<GameContextType>(
    () => ({
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
      submittingGuess,
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
      dailyLoadError,
      retryDailyChallenge,
      roundLoadError,
      retryRound,
      dailyIndex,
      dailyResults,
      dailyScore,
      dailyCorrectCount,
      dailySkipCount,
      dailyTotalAnswerTimeMs,
      dailyFeedback,
      guesserSkipCount,
      guesserFeedback,

      volume,
      setVolume,
      audioState,
      progress: 0,
      currentTime: 0,
      totalDuration,
      handleToggleSnippetPlay,
      handleToggleFullPreview,
      onSeek: seekFullPreview,

      handleSelectGuess,
      handleSkip,
      handleGuesserSkip,
      handleDailyTimeout,
      handleNextRoundOrDaily,

      addArtistOpen,
      setAddArtistOpen,
      leaderboardOpen,
      setLeaderboardOpen,
      ticketModalOpen,
      setTicketModalOpen,
    }),
    [
      config,
      artists,
      fetchArtists,
      syncArtist,
      syncingArtistId,
      round,
      loadingRound,
      submittingGuess,
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
      dailyLoadError,
      retryDailyChallenge,
      roundLoadError,
      retryRound,
      dailyIndex,
      dailyResults,
      dailyScore,
      dailyCorrectCount,
      dailySkipCount,
      dailyTotalAnswerTimeMs,
      dailyFeedback,
      guesserSkipCount,
      guesserFeedback,
      volume,
      audioState,
      totalDuration,
      handleToggleSnippetPlay,
      handleToggleFullPreview,
      seekFullPreview,
      handleDailyTimeout,
      handleGuesserSkip,
      handleNextRoundOrDaily,
      addArtistOpen,
      leaderboardOpen,
      ticketModalOpen,
    ]
  );

  return (
    <GameContext.Provider value={gameContextValue}>
      <AudioProgressContext.Provider value={audioProgressValue}>
        {children}
      </AudioProgressContext.Provider>
    </GameContext.Provider>
  );
};

