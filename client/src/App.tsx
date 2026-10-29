import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Disc, Flag, Home, ListChecks, RotateCcw, SkipForward, Sparkles, Trophy, XCircle } from 'lucide-react';
import {
  Artist,
  CategoryType,
  DailyChallengeInfo,
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  GameConfig,
  GuessHistoryItem,
  RoundActionResponse,
  RoundStartResponse,
  Song,
} from '../../shared/types';
import { useTheme } from './context/ThemeContext';
import { useAudioController } from './hooks/useAudioController';
import { Navbar } from './components/Navbar';
import { ModeSelector } from './components/ModeSelector';
import { AudioPlayer } from './components/AudioPlayer';
import { GuessAutocomplete } from './components/GuessAutocomplete';
import { SpinningAlbumArt } from './components/SpinningAlbumArt';
import { AddArtistModal } from './components/AddArtistModal';
import { LeaderboardModal } from './components/LeaderboardModal';

const STORAGE_STREAK_KEY = 'songspot:streak';
const STORAGE_BEST_STREAK_KEY = 'songspot:best-streak';
const STORAGE_FASTEST_KEY = 'songspot:fastest-time';
const STORAGE_LOCAL_ARTISTS_KEY = 'songspot:custom-artists';

export const App: React.FC = () => {
  const { setActiveDifficulty } = useTheme();

  const [config, setConfig] = useState<GameConfig>({
    category: 'thai',
    difficulty: 'easy',
    mode: 'standard',
    yearFilter: 'any',
    genreFilter: 'any',
  });

  const [artists, setArtists] = useState<Artist[]>([]);
  const [addArtistOpen, setAddArtistOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

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

  // Load artist pool from backend + localStorage fallback
  const fetchArtists = useCallback(async () => {
    try {
      const res = await fetch('/api/artists');
      const json = await res.json();
      if (json.code === 0 && Array.isArray(json.data)) {
        setArtists(json.data);
      }
    } catch {
      try {
        const local = JSON.parse(localStorage.getItem(STORAGE_LOCAL_ARTISTS_KEY) || '[]');
        if (Array.isArray(local)) setArtists(local);
      } catch {}
    }
  }, []);

  useEffect(() => {
    fetchArtists();
  }, [fetchArtists]);

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
        if (activeCfg.mode === 'daily') {
          const res = await fetch(
            `/api/daily?category=${activeCfg.category}&difficulty=${activeCfg.difficulty}`
          );
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

  // Auto-play 30-second full preview once when round ends (Post-Game Reveal, no looping)
  useEffect(() => {
    if ((outcome === 'correct' || outcome === 'failed') && audioState === 'ready' && !hasAutoPlayedRevealRef.current) {
      hasAutoPlayedRevealRef.current = true;
      const timer = setTimeout(() => {
        playFullPreview();
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [outcome, audioState, playFullPreview]);

  const stages =
    round?.stages || DIFFICULTY_PRESETS[config.difficulty].stages;
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

  // Keyboard shortcut: Spacebar to play/replay snippet (when not focused in an input)
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

  // Handle Config / Category changes
  const handleCategoryChange = (cat: CategoryType) => {
    const nextCfg: GameConfig = {
      ...config,
      category: cat,
      // Reset artist filter if switching category in standard mode
      ...(config.mode === 'artist' ? { mode: 'standard', artistName: undefined } : {}),
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

          // Update streak & fastest time
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

  // Skip current clue or give up directly
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
        setHistory((prev) => [
          ...prev,
          {
            title: giveUpDirectly
              ? 'ยอมแพ้ (Give Up)'
              : `ข้ามขั้นที่ ${currentStage + 1} (${activeClipSeconds}s)`,
            stageIndex: currentStage,
            clipSeconds: activeClipSeconds,
            status: 'skipped',
          },
        ]);

        if (data.outcome === 'failed' && data.reveal) {
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
      console.error('Error skipping stage:', err);
    }
  };

  const handleGiveUp = () => {
    handleSkip(true);
  };

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

  const handleToggleDailyMode = () => {
    const nextMode = config.mode === 'daily' ? 'standard' : 'daily';
    const nextCfg: GameConfig = {
      ...config,
      mode: nextMode,
      artistName: undefined,
      yearFilter: 'any',
      genreFilter: 'any',
    };
    setConfig(nextCfg);
    startNewRound(nextCfg);
  };

  const handleBackToHome = () => {
    const homeCfg: GameConfig = {
      ...config,
      mode: 'standard',
      artistName: undefined,
      yearFilter: 'any',
      genreFilter: 'any',
    };
    setConfig(homeCfg);
    startNewRound(homeCfg);
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
    <div className="min-h-screen flex flex-col relative">
      {/* Extracted Songspot Spotlight SVG Stage Cone */}
      <svg
        className="songspot-spotlight"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon
          className="songspot-cone"
          points="292,0 708,0 836,1000 164,1000"
        />
        <line x1="292" y1="0" x2="164" y2="1000" />
        <line x1="708" y1="0" x2="836" y2="1000" />
      </svg>

      {/* Top Navigation */}
      <Navbar
        category={config.category}
        onCategoryChange={handleCategoryChange}
        streak={streak}
        bestStreak={bestStreak}
        fastestTime={fastestTime}
        onOpenAddArtist={() => setAddArtistOpen(true)}
        artistCount={artists.length}
        isDailyMode={config.mode === 'daily'}
        onToggleDailyMode={handleToggleDailyMode}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
        onHomeClick={handleBackToHome}
      />

      {/* Main Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 flex flex-col items-center relative z-10">
        {/* BeatDrop Wordmark Slot */}
        <div className="mb-3 text-center overflow-visible">
          <div className="songspot-wordmark px-4 pb-1 italic bg-gradient-to-b from-white via-neutral-200 to-neutral-500 bg-clip-text text-transparent">
            BeatDrop
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            <span
              className="text-xs font-bold px-2.5 py-0.5 rounded-full border"
              style={{
                backgroundColor: 'var(--song-surface)',
                borderColor: 'var(--song-border)',
                color: 'var(--song-accent-text)',
              }}
            >
              {config.category === 'thai'
                ? '🇹🇭 โหมดเพลงไทย'
                : config.category === 'international'
                  ? '🌍 โหมดเพลงสากล'
                  : '🔥 รวมเพลงไทย & สากล'}
            </span>
            {config.mode === 'daily' && dailyInfo && (
              <span
                className="text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--song-accent)',
                  borderColor: 'var(--song-accent)',
                  color: 'var(--song-accent-on)',
                }}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Daily Challenge ({dailyInfo.dateKey}) • เพลงที่ {dailyIndex + 1}/{dailyInfo.totalRounds}
              </span>
            )}
            {config.mode === 'artist' && config.artistName && (
              <span
                className="text-xs font-bold px-2.5 py-0.5 rounded-full border"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-accent)',
                  color: 'var(--song-text)',
                }}
              >
                🎤 ศิลปิน: {config.artistName}
              </span>
            )}
            {config.mode === 'year' && config.yearFilter && config.yearFilter !== 'any' && (
              <span
                className="text-xs font-bold px-2.5 py-0.5 rounded-full border"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-accent)',
                  color: 'var(--song-text)',
                }}
              >
                📅 ปี/ยุค: {config.yearFilter}
              </span>
            )}
            {config.mode === 'genre' && config.genreFilter && config.genreFilter !== 'any' && (
              <span
                className="text-xs font-bold px-2.5 py-0.5 rounded-full border"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-accent)',
                  color: 'var(--song-text)',
                }}
              >
                🎸 แนวเพลง: {config.genreFilter}
              </span>
            )}
            {config.mode === 'guesser' && (
              <span
                className="text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--song-accent)',
                  borderColor: 'var(--song-accent)',
                  color: 'var(--song-accent-on)',
                }}
              >
                <ListChecks className="w-3.5 h-3.5" />
                MULTIPLE CHOICE • Hear it. Pick it. (4 ตัวเลือก)
              </span>
            )}
          </div>
        </div>

        {/* Daily Challenge 5-Song Progress Banner & Difficulty Controls */}
        {config.mode === 'daily' && dailyInfo && (
          <div className="w-full max-w-xl mb-4 space-y-3">
            {/* Top Bar: Back to Home + Date badge */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleBackToHome}
                className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition hover:brightness-110 shadow-sm"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              >
                <ArrowLeft className="w-4 h-4" />
                <Home className="w-3.5 h-3.5" />
                <span>กลับสู่หน้าแรก (Standard Mode)</span>
              </button>

              <div
                className="text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-muted)',
                }}
              >
                <CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--song-accent-text)' }} />
                <span>{dailyInfo.dateKey}</span>
              </div>
            </div>

            {/* Daily Difficulty Tab Selector */}
            <div
              className="p-3 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3"
              style={{
                backgroundColor: 'var(--song-surface)',
                borderColor: 'var(--song-border)',
              }}
            >
              <div
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
                style={{ color: 'var(--song-muted)' }}
              >
                <Disc className="w-4 h-4" style={{ color: 'var(--song-accent-text)' }} />
                <span>ระดับความยาก Daily:</span>
              </div>

              <div className="songspot-difficulty-tabs !w-auto">
                {(['easy', 'medium', 'hard', 'expert', 'impossible'] as DifficultyLevel[]).map((lvl) => {
                  const preset = DIFFICULTY_PRESETS[lvl];
                  const isSelected = config.difficulty === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      className="songspot-difficulty-tab"
                      aria-pressed={isSelected}
                      style={
                        {
                          '--tab-color': preset.accent,
                          '--tab-text': preset.accentText,
                          '--tab-on': preset.accentOn,
                        } as React.CSSProperties
                      }
                      onClick={() => handleDailyDifficultySelect(lvl)}
                      title={preset.description}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Daily Challenge Progress & Score */}
            <div
              className="p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3"
              style={{
                backgroundColor: 'var(--song-surface)',
                borderColor: 'var(--song-accent)',
              }}
            >
              <div>
                <div
                  className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5"
                  style={{ color: 'var(--song-accent-text)' }}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>Daily Challenge ประจำวันที่ {dailyInfo.dateKey}</span>
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--song-muted)' }}>
                  ทาย 5 เพลงประจำวัน คะแนนสะสมวันนี้: <strong style={{ color: 'var(--song-text)' }}>{dailyScore} PTS</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {dailyResults.map((status, idx) => {
                  const isCurrent = idx === dailyIndex;
                  return (
                    <div
                      key={idx}
                      className="w-8 h-8 rounded-full border flex items-center justify-center text-xs font-extrabold transition"
                      style={
                        status === 'correct'
                          ? {
                              backgroundColor: 'var(--song-accent)',
                              borderColor: 'var(--song-accent)',
                              color: 'var(--song-accent-on)',
                            }
                          : status === 'failed'
                            ? {
                                backgroundColor: '#ef4444',
                                borderColor: '#ef4444',
                                color: '#ffffff',
                              }
                            : isCurrent
                              ? {
                                  borderColor: 'var(--song-accent)',
                                  color: 'var(--song-accent-text)',
                                  backgroundColor: 'var(--song-surface-soft)',
                                }
                              : {
                                  borderColor: 'var(--song-border)',
                                  color: 'var(--song-muted)',
                                }
                      }
                    >
                      {status === 'correct' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : status === 'failed' ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setLeaderboardOpen(true)}
                  className="ml-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 hover:brightness-110"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                    color: 'var(--song-accent-text)',
                  }}
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span>อันดับ</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mode, Difficulty & Filter Selector */}
        {config.mode !== 'daily' && (
          <ModeSelector
            config={config}
            onChangeConfig={handleConfigChange}
            artists={artists}
            category={config.category}
            poolSize={round?.poolSize || 0}
            onReroll={() => startNewRound(config)}
          />
        )}

        {/* Active Game Stage Card */}
        <div
          className="w-full max-w-xl rounded-3xl border p-5 sm:p-7 shadow-2xl transition-all"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--song-surface) 92%, transparent)',
            borderColor: 'var(--song-border)',
          }}
        >
          {outcome && revealSong ? (
            /* Post-Game Reveal & Spinning Vinyl UI (30s Preview Player) */
            <SpinningAlbumArt
              song={revealSong}
              outcome={outcome}
              guessedAtSeconds={activeClipSeconds}
              difficulty={config.difficulty}
              stages={stages}
              history={history}
              streak={streak}
              audioState={audioState}
              currentTime={currentTime}
              totalDuration={totalDuration}
              onToggleFullPlay={handleToggleFullPreview}
              onSeek={seekFullPreview}
              volume={volume}
              onVolumeChange={setVolume}
              onNextSong={handleNextRoundOrDaily}
            />
          ) : (
            /* Active Guessing Board */
            <>
              <AudioPlayer
                stages={stages}
                currentStage={currentStage}
                audioState={audioState}
                progress={progress}
                onTogglePlay={handleToggleSnippetPlay}
                volume={volume}
                onVolumeChange={setVolume}
                disabled={loadingRound || !round}
              />

              {/* Previous Wrong / Skipped Attempts */}
              {history.length > 0 && (
                <div className="w-full space-y-1.5 mt-4">
                  {history.map((item, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2"
                      style={{
                        backgroundColor: 'var(--song-surface-soft)',
                        borderColor: 'var(--song-border)',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                        <span className="truncate">
                          {item.artistName
                            ? `${item.title} — ${item.artistName}`
                            : item.title}
                        </span>
                      </div>
                      <span
                        className="font-mono text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{
                          backgroundColor: 'var(--song-surface)',
                          color: 'var(--song-muted)',
                        }}
                      >
                        {item.clipSeconds}s
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Song Guesser 4-Choice Mode vs Scoped Autocomplete Search */}
              {config.mode === 'guesser' && round?.choices && round.choices.length > 0 ? (
                <div className="w-full mt-5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold px-1">
                    <span className="uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--song-accent-text)' }}>
                      <ListChecks className="w-4 h-4" />
                      <span>MULTIPLE CHOICE • เลือกคำตอบจาก 4 ตัวเลือก</span>
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--song-muted)' }}>
                      Hear it. Pick it.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {round.choices.map((choice, idx) => {
                      const letter = String.fromCharCode(65 + idx);
                      const alreadyGuessedWrong = history.some(
                        (h) =>
                          h.status === 'wrong' &&
                          (h.trackId === choice.id ||
                            (h.title.toLowerCase() === choice.title.toLowerCase() &&
                              (h.artistName || '').toLowerCase() === choice.artistName.toLowerCase()))
                      );

                      return (
                        <button
                          key={`${choice.id}-${idx}`}
                          type="button"
                          disabled={loadingRound || !round || alreadyGuessedWrong}
                          onClick={() =>
                            handleSelectGuess({
                              id: choice.id,
                              title: choice.title,
                              artistName: choice.artistName,
                            })
                          }
                          className="group relative flex items-center gap-3 p-3 rounded-2xl border text-left transition-all hover:scale-[1.01] disabled:opacity-45 disabled:pointer-events-none"
                          style={
                            alreadyGuessedWrong
                              ? {
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                  borderColor: 'rgba(239, 68, 68, 0.45)',
                                  color: 'var(--song-muted)',
                                }
                              : {
                                  backgroundColor: 'var(--song-surface-soft)',
                                  borderColor: 'var(--song-border)',
                                  color: 'var(--song-text)',
                                }
                          }
                        >
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-xs flex-shrink-0 border transition-colors"
                            style={
                              alreadyGuessedWrong
                                ? {
                                    backgroundColor: '#ef4444',
                                    borderColor: '#ef4444',
                                    color: '#ffffff',
                                  }
                                : {
                                    backgroundColor: 'var(--song-surface)',
                                    borderColor: 'var(--song-accent)',
                                    color: 'var(--song-accent-text)',
                                  }
                            }
                          >
                            {letter}
                          </div>

                          {choice.artworkUrl && (
                            <img
                              src={choice.artworkUrl}
                              alt={choice.title}
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border"
                              style={{ borderColor: 'var(--song-border)' }}
                            />
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs sm:text-sm truncate">
                              {choice.title}
                            </div>
                            <div
                              className="text-[11px] truncate"
                              style={{ color: 'var(--song-muted)' }}
                            >
                              {choice.artistName}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex justify-end items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSkip(false)}
                      disabled={loadingRound || !round}
                      className="px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition hover:brightness-110 disabled:opacity-50"
                      style={{
                        backgroundColor: 'var(--song-surface-soft)',
                        borderColor: 'var(--song-border)',
                        color: 'var(--song-text)',
                      }}
                    >
                      <SkipForward className="w-4 h-4" style={{ color: 'var(--song-accent-text)' }} />
                      <span>
                        {nextStageSeconds !== null
                          ? `ข้าม (+ปลดล็อกเป็น ${nextStageSeconds}s)`
                          : 'ยอมแพ้ / เฉลยเพลง'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleGiveUp}
                      disabled={loadingRound || !round}
                      className="px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition hover:brightness-110 disabled:opacity-50"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderColor: 'rgba(239, 68, 68, 0.35)',
                        color: '#f87171',
                      }}
                      title="ยอมแพ้เพื่อเฉลยเพลงทันที"
                    >
                      <Flag className="w-3.5 h-3.5 text-red-400" />
                      <span>ยอมแพ้</span>
                    </button>
                  </div>
                </div>
              ) : (
                <GuessAutocomplete
                  category={config.category}
                  mode={config.mode}
                  artistFilter={config.artistName && config.artistName !== 'any' ? config.artistName : undefined}
                  onSelectGuess={handleSelectGuess}
                  onSkip={() => handleSkip(false)}
                  onGiveUp={handleGiveUp}
                  nextStageSeconds={nextStageSeconds}
                  disabled={loadingRound || !round}
                />
              )}

              {/* Bottom Helper Bar */}
              <div
                className="mt-4 pt-3 border-t flex items-center justify-between text-[11px]"
                style={{ borderColor: 'var(--song-border)', color: 'var(--song-muted)' }}
              >
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--song-accent-text)' }} />
                  <span>คลังเพลงในโหมดนี้: {round?.poolSize ?? '...'} เพลง</span>
                </span>

                <button
                  type="button"
                  onClick={() => startNewRound(config)}
                  className="font-bold flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--song-accent-text)' }}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>สุ่มโจทย์เพลงใหม่</span>
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Add / Manage Artists Modal */}
      <AddArtistModal
        isOpen={addArtistOpen}
        onClose={() => setAddArtistOpen(false)}
        artists={artists}
        onArtistAdded={(newArtist) => {
          setArtists((prev) => {
            const exists = prev.some(
              (a) => a.name.toLowerCase() === newArtist.name.toLowerCase()
            );
            const updated = exists
              ? prev.map((a) =>
                  a.name.toLowerCase() === newArtist.name.toLowerCase() ? newArtist : a
                )
              : [...prev, newArtist];
            try {
              localStorage.setItem(
                STORAGE_LOCAL_ARTISTS_KEY,
                JSON.stringify(updated.filter((a) => a.isCustom))
              );
            } catch {}
            return updated;
          });
        }}
        onArtistRemoved={async (id) => {
          try {
            await fetch(`/api/artists/${id}`, { method: 'DELETE' });
          } catch {}
          setArtists((prev) => prev.filter((a) => a.id !== id));
        }}
        onPlayArtist={(artist) => {
          const nextCfg: GameConfig = {
            ...config,
            category: artist.category,
            mode: 'artist',
            artistName: artist.name,
          };
          setConfig(nextCfg);
          startNewRound(nextCfg);
        }}
      />

      {/* Leaderboard Modal */}
      <LeaderboardModal
        isOpen={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        category={config.category}
        currentStreak={streak}
        bestStreak={bestStreak}
        fastestTime={fastestTime}
        currentDifficulty={config.difficulty}
        dailyScore={config.mode === 'daily' ? dailyScore : null}
        isDailyMode={config.mode === 'daily'}
      />
    </div>
  );
};

export default App;

