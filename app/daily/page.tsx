'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '../../context/GameContext';
import { AudioPlayer } from '../../components/AudioPlayer';
import { GuessAutocomplete } from '../../components/GuessAutocomplete';
import { SpinningAlbumArt } from '../../components/SpinningAlbumArt';
import { TimeRangeSelector } from '../../components/TimeRangeSelector';
import {
  CalendarDays,
  Trophy,
  Loader2,
  Play,
  Share2,
  Check,
} from 'lucide-react';
import { DEFAULT_TIME_STAGES, DIFFICULTY_PRESETS, DifficultyLevel, GameConfig } from '../../types';
import { shareOrCopy } from '../../lib/shareUtils';

const DailyChallengePage: React.FC = () => {
  const router = useRouter(); const navigate = (p: string) => router.push(p);
  const [copiedShareText, setCopiedShareText] = useState(false);
  const {
    config,
    handleConfigChange,
    handleDailyDifficultySelect,
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
    dailyInfo,
    dailyLoadError,
    retryDailyChallenge,
    dailyIndex,
    dailyResults,
    dailyScore,
    dailyCorrectCount,
    dailySkipCount,
    dailyTotalAnswerTimeMs,
    dailyFeedback,
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
  const handleConfigChangeRef = useRef(handleConfigChange);
  handleConfigChangeRef.current = handleConfigChange;

  // Normalize only configuration on page entry. Missing challenge data is handled as a load error below,
  // so a failed request cannot trigger an automatic request loop.
  useEffect(() => {
    if (config.mode !== 'daily') {
      let targetCat = config.category;
      let targetDiff = config.difficulty;
      try {
        const savedCat = localStorage.getItem('songspot:daily-category') as any;
        const savedDiff = localStorage.getItem('songspot:daily-difficulty') as any;
        if (['thai', 'international', 'all'].includes(savedCat)) targetCat = savedCat;
        if (['easy', 'medium', 'hard', 'expert', 'impossible'].includes(savedDiff)) targetDiff = savedDiff;
      } catch {}

      handleConfigChangeRef.current(
        {
          ...config,
          mode: 'daily',
          category: targetCat,
          difficulty: targetDiff,
          timeRangePreset: config.timeRangePreset || 'standard',
          artistName: undefined,
          yearFilter: 'any',
          genreFilter: 'any',
        },
        true
      );
    } else if (
      Boolean(config.artistName) ||
      (config.yearFilter || 'any') !== 'any' ||
      (config.genreFilter || 'any') !== 'any'
    ) {
      handleConfigChangeRef.current(
        {
          ...config,
          artistName: undefined,
          yearFilter: 'any',
          genreFilter: 'any',
        },
        false
      );
    }
  }, [config.mode, config.artistName, config.yearFilter, config.genreFilter]);

  // Check if all 5 daily songs have been finished
  const isDailyFinished =
    dailyResults.length === 5 &&
    dailyResults.every((r) => r !== 'pending') &&
    (!outcome || dailyIndex >= 5);

  const handleShareDailyResult = async () => {
    const emojiMap: Record<string, string> = {
      correct: '🟩',
      wrong: '🟥',
      skipped: '🟧',
      expired: '⬛',
      pending: '⬜',
    };
    const emojiRow = dailyResults.map((r) => emojiMap[r] || '⬛').join(' ');
    const catLabel = config.category === 'thai' ? 'เพลงไทย 🇹🇭' : config.category === 'international' ? 'เพลงสากล 🌍' : 'รวมไทย & สากล 🔥';
    const diffLabel = config.difficulty.toUpperCase();
    const shareText = `BeatDrop Daily #${dailyInfo?.dateKey || 'Challenge'}\nโหมด: ${catLabel} (${diffLabel})\n${emojiRow}\nคะแนน: ${dailyScore} pts (ถูก ${dailyCorrectCount}/5)\nhttps://beatdrop.app/daily`;

    const result = await shareOrCopy({
      title: 'BeatDrop Daily Challenge Result',
      text: shareText,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });
    if (result === 'copied') {
      setCopiedShareText(true);
      setTimeout(() => setCopiedShareText(false), 2500);
    }
  };

  return (
    <div className="w-full flex flex-col items-center my-auto">
      {/* 1. Header Wordmark & Tagline (Consistent across all 3 features) */}
      <div className="mb-3 text-center overflow-visible">
        <div className="songspot-wordmark px-4 pb-0.5 italic bg-gradient-to-b from-amber-200 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
          Daily Challenge
        </div>
        <p
          className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.24em] mt-0.5"
          style={{ color: 'var(--song-muted)' }}
        >
          5 SONGS • HEAR LESS. KNOW MORE.
        </p>

        {/* Status & Badge Pills Row (Consistent layout) */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {/* Date Badge */}
          <div
            className="flex items-center gap-1.5 px-3.5 py-1 sm:py-1.5 rounded-full border text-xs font-bold shadow-sm"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            <CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--song-accent-text)' }} />
            <span>{dailyInfo?.dateKey || 'Daily Challenge'}</span>
          </div>

          {/* Daily Score Pill */}
          <div
            className="flex items-center gap-1.5 px-3.5 py-1 sm:py-1.5 rounded-full border text-xs font-bold shadow-sm"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            <span style={{ color: 'var(--song-muted)' }}>Score:</span>
            <strong className="font-mono text-amber-400">{dailyScore} pts</strong>
          </div>

          {/* Round Stats Pill */}
          <div
            className="flex items-center gap-2 px-3 py-1 sm:py-1.5 rounded-full border text-xs font-bold shadow-sm"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-muted)',
            }}
          >
            <span>Round <strong className="text-white">{Math.min(dailyIndex + 1, dailyInfo?.totalRounds || 5)}/{dailyInfo?.totalRounds || 5}</strong></span>
            <span className="opacity-30">|</span>
            <span className="text-emerald-400">✓ {dailyCorrectCount}</span>
            <span className="opacity-30">|</span>
            <span className="text-amber-400">✕ {dailySkipCount}</span>
          </div>

          {/* Rankings Button */}
          <button
            type="button"
            onClick={() => setLeaderboardOpen(true)}
            className="px-3 py-1 sm:py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 transition hover:brightness-110 shadow-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, #f59e0b 16%, var(--song-surface))',
              borderColor: 'rgba(245, 158, 11, 0.4)',
              color: '#fbbf24',
            }}
            title="เปิดตารางคะแนนอันดับผู้เล่น (Daily Rankings)"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Rankings</span>
          </button>

          {/* Category Pill / Switcher */}
          <button
            type="button"
            onClick={() => {
              const nextCat = config.category === 'thai' ? 'international' : config.category === 'international' ? 'all' : 'thai';
              handleConfigChange({ ...config, category: nextCat }, true);
            }}
            className="text-xs font-bold px-2.5 py-1 sm:py-1.5 rounded-full border transition hover:brightness-110 active:scale-95 cursor-pointer flex items-center gap-1 shadow-sm"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-accent-text)',
            }}
            title="กดเพื่อสลับโหมด: เพลงไทย / เพลงสากล / รวมไทย & สากล"
          >
            <span>
              {config.category === 'thai'
                ? '🇹🇭 เพลงไทย'
                : config.category === 'international'
                  ? '🌍 เพลงสากล'
                  : '🔥 รวมไทย & สากล'}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Controls Card: 5-Song Progress + Difficulty + Time Range */}
      <div
        className="w-full max-w-xl p-3 rounded-2xl border flex flex-col items-center justify-center gap-2.5 mb-3"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
        }}
      >
        {/* Row 1: 5-Song Progress Dots */}
        {dailyInfo && (
          <div className="w-full flex items-center justify-between px-2 text-xs font-bold">
            <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              ความคืบหน้า (5 เพลง)
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
                      ? { backgroundColor: '#22c55e', borderColor: '#22c55e', color: '#ffffff' }
                      : res === 'wrong' || res === 'expired'
                        ? { backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#ffffff' }
                        : res === 'skipped'
                          ? { backgroundColor: '#f59e0b', borderColor: '#f59e0b', color: '#111827' }
                        : { backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)', color: 'var(--song-muted)' }
                  }
                >
                  {res === 'correct' ? '✓' : res === 'wrong' || res === 'expired' ? '✕' : res === 'skipped' ? '−' : i + 1}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="w-full h-px opacity-30 my-0.5" style={{ backgroundColor: 'var(--song-border)' }} />

        {/* Row 2: Difficulty Tabs */}
        <div className="songspot-difficulty-tabs w-full justify-center">
          {(['easy', 'medium', 'hard', 'expert', 'impossible'] as DifficultyLevel[]).map(
            (lvl) => {
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
            }
          )}
        </div>

        <div className="w-full h-px opacity-30 my-0.5" style={{ backgroundColor: 'var(--song-border)' }} />

        {/* Row 3: Time Range (Centered) */}
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

      {/* 3. Game Arena Card (Identical structure to PlayPage) */}
      <div
        className="w-full max-w-xl rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 border shadow-2xl relative transition-colors duration-200"
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
            <div className="text-xs mb-4" style={{ color: 'var(--song-muted)' }}>
              {dailyCorrectCount} correct · {dailyResults.filter((result) => result === 'wrong').length} wrong · {dailySkipCount} skipped · {dailyResults.filter((result) => result === 'expired').length} expired · {Math.round(dailyTotalAnswerTimeMs / 1000)}s answer time
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

            {/* Share Result Button (Wordle-style Emoji Scorecard) */}
            <button
              type="button"
              onClick={handleShareDailyResult}
              className="w-full max-w-sm py-3 px-4 mb-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:brightness-110 active:scale-98 shadow-md cursor-pointer"
              style={{
                backgroundColor: '#22c55e',
                color: '#ffffff',
              }}
            >
              {copiedShareText ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>คัดลอกผลลัพธ์ลงคลิปบอร์ดแล้ว!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-white" />
                  <span>แชร์ผลคะแนนประจำวัน (Share Scorecard)</span>
                </>
              )}
            </button>

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
        ) : dailyLoadError ? (
          <div className="py-12 px-4 flex flex-col items-center text-center gap-3">
            <p className="text-sm font-bold" role="alert">{dailyLoadError}</p>
            <button
              type="button"
              onClick={() => void retryDailyChallenge()}
              disabled={loadingRound}
              className="min-h-11 rounded-xl px-5 font-extrabold transition hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
            >
              {loadingRound ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        ) : loadingRound || !dailyInfo || config.mode !== 'daily' || !round ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2
              className="w-10 h-10 animate-spin"
              style={{ color: 'var(--song-accent-text)' }}
            />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              กำลังโหลดโจทย์เพลงประจำวัน (5 เพลง)...
            </p>
          </div>
        ) : outcome && revealSong ? (
          <>
          <div className="text-center text-sm font-bold mb-2 flex items-center justify-center gap-2 flex-wrap" role="status" aria-live="polite">
            {dailyFeedback?.dailyResult === 'correct' && (
              <span className="text-emerald-400">
                ✓ ตอบถูก! +{dailyFeedback.scoreDelta} pts
                {Boolean(dailyFeedback.speedBonus) && ` (โบนัสความเร็ว +${dailyFeedback.speedBonus})`}
                {typeof dailyFeedback.elapsedTimeMs === 'number' && ` · ${(dailyFeedback.elapsedTimeMs / 1000).toFixed(1)}s`}
              </span>
            )}
            {dailyFeedback?.dailyResult === 'wrong' && (
              <span className="text-red-400">✕ ทายผิด · 0 pts</span>
            )}
            {dailyFeedback?.dailyResult === 'skipped' && (
              <span className="text-amber-400">− ยอมแพ้ / ข้ามเพลง · 0 pts</span>
            )}
            {dailyFeedback?.dailyResult === 'expired' && (
              <span className="text-neutral-400">รอบสิ้นสุด · 0 pts</span>
            )}
          </div>
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
          </>
        ) : (
          <div className="flex flex-col items-center">
            {dailyFeedback?.dailyResult === 'wrong' && (
              <div className="w-full text-center text-sm font-bold text-red-400 mb-2" role="status" aria-live="polite">
                Wrong answer · 0 pts. Keep listening.
              </div>
            )}
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
                submitting={submittingGuess}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyChallengePage;
