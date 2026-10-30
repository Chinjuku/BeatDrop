import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { AudioPlayer } from '../components/AudioPlayer';
import { GuessAutocomplete } from '../components/GuessAutocomplete';
import { SpinningAlbumArt } from '../components/SpinningAlbumArt';
import { TimeRangeSelector } from '../components/TimeRangeSelector';
import {
  CalendarDays,
  ArrowLeft,
  Home,
  Disc,
  Trophy,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
} from 'lucide-react';
import { DIFFICULTY_PRESETS, DifficultyLevel, GameConfig } from '../../../shared/types';

export const DailyChallengePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    config,
    handleConfigChange,
    handleDailyDifficultySelect,
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
    onSeek,
    handleSelectGuess,
    handleSkip,
    handleNextRoundOrDaily,
    setTicketModalOpen,
    setLeaderboardOpen,
  } = useGame();

  // Ensure config mode is daily
  useEffect(() => {
    if (config.mode !== 'daily') {
      handleConfigChange(
        {
          ...config,
          mode: 'daily',
          artistName: undefined,
          yearFilter: 'any',
          genreFilter: 'any',
        },
        true
      );
    }
  }, [config.mode]);

  // Check if all 5 daily songs have been finished
  const isDailyFinished =
    dailyResults.length === 5 &&
    dailyResults.every((r) => r !== 'pending') &&
    !outcome;

  return (
    <div className="w-full flex flex-col items-center my-auto">
      {/* Top Bar: Back to Home + Date badge */}
      <div className="w-full max-w-xl mb-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate('/play')}
            className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition hover:brightness-110 shadow-sm"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            <Home className="w-3.5 h-3.5" />
            <span>กลับสู่หน้าแรก (Play)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLeaderboardOpen(true)}
              className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition hover:brightness-110 shadow-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, #f59e0b 16%, var(--song-surface))',
                borderColor: 'rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
              }}
              title="เปิดตารางคะแนนอันดับผู้เล่น (Daily Rankings)"
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Rankings (ตารางอันดับ)</span>
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
              <span>{dailyInfo?.dateKey || 'Daily Challenge'}</span>
            </div>
          </div>
        </div>

        {/* Daily Difficulty & Time Range Selector */}
        <div
          className="p-3 rounded-2xl border flex flex-col items-center justify-center gap-2.5"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
          }}
        >
          {/* Row 1: ระดับความยาก (แถวแนวนอน) */}
          <div
            className="w-full flex items-center justify-center gap-2.5 text-xs font-bold uppercase tracking-wider flex-wrap"
            style={{ color: 'var(--song-muted)' }}
          >
            <div className="flex items-center gap-1.5 shrink-0">
              <Disc className="w-3.5 h-3.5" style={{ color: 'var(--song-accent-text)' }} />
              <span>ระดับความยาก Daily:</span>
            </div>
            <div className="songspot-difficulty-tabs !w-auto">
              {(['easy', 'medium', 'hard', 'expert', 'impossible'] as DifficultyLevel[]).map(
                (lvl) => {
                  const preset = DIFFICULTY_PRESETS[lvl];
                  const isSelected = config.difficulty === lvl;
                  // Check if all 5 daily songs have been finished
  const isDailyFinished =
    dailyResults.length === 5 &&
    dailyResults.every((r) => r !== 'pending') &&
    !outcome;

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
                }
              )}
            </div>
          </div>

          <div
            className="w-full h-px opacity-30 my-0.5"
            style={{ backgroundColor: 'var(--song-border)' }}
          />

          {/* Row 2: Time Range (แถวแนวนอนด้านล่าง) */}
          <div className="w-full flex items-center justify-center">
            <TimeRangeSelector
              currentPreset={config.timeRangePreset}
              stages={config.customStages}
              onChangePreset={(presetId, nextStages) => {
                const nextCfg: GameConfig = {
                  ...config,
                  timeRangePreset: presetId,
                  customStages: nextStages,
                };
                handleConfigChange(nextCfg, true);
              }}
            />
          </div>
        </div>

        {/* Daily Challenge Progress & Score */}
        {dailyInfo && (
          <div
            className="p-3.5 rounded-2xl border flex items-center justify-between shadow-md"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--song-muted)' }}>
                ความคืบหน้า (5 เพลง):
              </span>
              <div className="flex items-center gap-1.5">
                {dailyResults.map((res, i) => (
                  <div
                    key={i}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                      i === dailyIndex
                        ? 'ring-2 ring-[var(--song-accent)] scale-110 font-extrabold'
                        : ''
                    }`}
                    style={
                      res === 'correct'
                        ? {
                            backgroundColor: '#22c55e',
                            borderColor: '#22c55e',
                            color: '#ffffff',
                          }
                        : res === 'failed'
                          ? {
                              backgroundColor: '#ef4444',
                              borderColor: '#ef4444',
                              color: '#ffffff',
                            }
                          : {
                              backgroundColor: 'var(--song-surface-soft)',
                              borderColor: 'var(--song-border)',
                              color: 'var(--song-muted)',
                            }
                    }
                  >
                    {res === 'correct' ? '✓' : res === 'failed' ? '✕' : i + 1}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
                  Daily Score
                </div>
                <div className="text-sm font-extrabold font-mono" style={{ color: 'var(--song-accent-text)' }}>
                  {dailyScore} pts
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLeaderboardOpen(true)}
                className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border hover:brightness-110 transition flex items-center gap-1.5 text-xs font-bold"
                style={{
                  backgroundColor: 'color-mix(in srgb, #f59e0b 14%, var(--song-surface-soft))',
                  borderColor: 'rgba(245, 158, 11, 0.3)',
                  color: '#fbbf24',
                }}
                title="ดูตารางอันดับ Daily Challenge"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Rankings</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Game Arena Card */}
      <div
        className="w-full max-w-xl rounded-3xl p-4 sm:p-6 border shadow-2xl relative transition-colors duration-200"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
        }}
      >
        {isDailyFinished ? (
          <div className="py-8 px-4 flex flex-col items-center text-center animate-in fade-in duration-300">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 border shadow-lg"
              style={{
                backgroundColor: 'color-mix(in srgb, #f59e0b 22%, transparent)',
                borderColor: '#f59e0b',
                color: '#fbbf24',
              }}
            >
              <Trophy className="w-8 h-8" />
            </div>
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-400 mb-1">
              DAILY CHALLENGE COMPLETED
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">
              ทำภารกิจครบ 5 เพลงแล้ว!
            </h2>
            <p className="text-xs" style={{ color: 'var(--song-muted)' }}>
              คะแนนรวมประจำวันของคุณ
            </p>
            <div className="text-4xl font-black font-mono my-3" style={{ color: 'var(--song-accent-text)' }}>
              {dailyScore} pts
            </div>

            <div className="flex items-center gap-2 mb-6">
              {dailyResults.map((res, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border"
                  style={
                    res === 'correct'
                      ? { backgroundColor: '#22c55e', borderColor: '#22c55e', color: '#fff' }
                      : { backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }
                  }
                >
                  {res === 'correct' ? '✓' : '✕'}
                </div>
              ))}
            </div>

            <div className="w-full flex flex-col sm:flex-row gap-2.5 max-w-sm">
              <button
                type="button"
                onClick={() => setLeaderboardOpen(true)}
                className="flex-1 py-3 px-4 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition hover:brightness-110 shadow-sm"
                style={{
                  backgroundColor: 'color-mix(in srgb, #f59e0b 18%, var(--song-surface))',
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                  color: '#fbbf24',
                }}
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>ดูตารางอันดับ (Rankings)</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/play')}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition hover:brightness-110 shadow-sm"
                style={{
                  backgroundColor: 'var(--song-accent)',
                  color: 'var(--song-accent-on)',
                }}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>เล่นโหมดฝึกซ้อม (Play)</span>
              </button>
            </div>
          </div>
        ) : loadingRound ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2
              className="w-10 h-10 animate-spin"
              style={{ color: 'var(--song-accent-text)' }}
            />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              กำลังโหลดโจทย์เพลงประจำวัน...
            </p>
          </div>
        ) : outcome && revealSong ? (
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
            onSeek={onSeek}
            volume={volume}
            onVolumeChange={setVolume}
            onNextSong={handleNextRoundOrDaily}
            onOpenTicket={() => setTicketModalOpen(true)}
          />
        ) : (
          <div className="flex flex-col items-center">
            {/* Audio Snippet Controller */}
            <AudioPlayer
              stages={stages}
              currentStage={currentStage}
              audioState={audioState}
              progress={progress}
              onTogglePlay={handleToggleSnippetPlay}
              volume={volume}
              onVolumeChange={setVolume}
              disabled={Boolean(outcome)}
            />

            {/* Guess Attempts History */}
            {history.length > 0 && (
              <div className="w-full mt-4 space-y-1.5">
                <div
                  className="text-[10px] font-extrabold uppercase tracking-wider px-1"
                  style={{ color: 'var(--song-muted)' }}
                >
                  ประวัติการทายในรอบนี้ ({history.length}/{stages.length})
                </div>
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold"
                    style={{
                      backgroundColor:
                        item.status === 'correct'
                          ? 'rgba(34, 197, 94, 0.15)'
                          : item.status === 'wrong'
                            ? 'rgba(239, 68, 68, 0.12)'
                            : 'var(--song-surface-soft)',
                      borderColor:
                        item.status === 'correct'
                          ? '#22c55e'
                          : item.status === 'wrong'
                            ? 'rgba(239, 68, 68, 0.35)'
                            : 'var(--song-border)',
                    }}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold">
                        {item.status === 'correct' ? '🟩' : item.status === 'wrong' ? '🟥' : '🟨'}
                      </span>
                      <span className="truncate">{item.title}</span>
                      {item.artistName && item.artistName !== '—' && (
                        <span className="opacity-60 text-[11px] truncate">• {item.artistName}</span>
                      )}
                    </div>
                    <span
                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md shrink-0 ml-2"
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

            {/* Autocomplete Input & Skip/Give Up buttons */}
            <div className="w-full mt-5">
              <GuessAutocomplete
                category={config.category}
                mode="daily"
                onSelectGuess={handleSelectGuess}
                onSkip={() => handleSkip(false)}
                onGiveUp={() => handleSkip(true)}
                nextStageSeconds={nextStageSeconds}
                disabled={loadingRound || !round}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

