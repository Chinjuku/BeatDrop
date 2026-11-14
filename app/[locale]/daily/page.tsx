'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '../../../i18n/navigation';
import { useGame } from '../../../context/GameContext';
import { PageHero, HeroPill, HeroPillButton, HeroPillDivider } from '../../../components/PageHero';
import { AudioPlayer } from '../../../components/AudioPlayer';
import { GuessAutocomplete } from '../../../components/GuessAutocomplete';
import { SpinningAlbumArt } from '../../../components/SpinningAlbumArt';
import { SetupDisclosure, describeSetup } from '../../../components/SetupDisclosure';
import {
  CalendarDays,
  Trophy,
  Loader2,
  Play,
  Share2,
  Check,
  Clock,
  History,
} from 'lucide-react';
import { StatusMark } from '../../../components/StatusMark';
import { DAILY_TIME_STAGES, DIFFICULTY_PRESETS, DifficultyLevel } from '../../../types';
import { buildShareGrid, difficultyName, shareLink, shareOrCopy } from '../../../lib/shareUtils';
import { getPreference } from '../../../lib/preferenceStorage';

const DailyChallengePage: React.FC = () => {
  const router = useRouter(); const navigate = (p: string) => router.push(p);
  const t = useTranslations('Daily');
  const ta = useTranslations('Archive');
  const tc = useTranslations('Common');
  const tgame = useTranslations('Game');
  const tshare = useTranslations('Share');
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
        const savedCat = getPreference('songspot:daily-category') as any;
        const savedDiff = getPreference('songspot:daily-difficulty') as any;
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
    const catLabel = config.category === 'thai' ? tc('category.thai') : config.category === 'international' ? tc('category.international') : tc('category.mixed');
    const shareText = [
      dailyInfo?.dateKey ? tshare('result.dailyHeader', { date: dailyInfo.dateKey }) : 'BeatDrop Daily',
      tshare('result.modeLine', { category: catLabel, difficulty: difficultyName(config.difficulty) }),
      buildShareGrid(dailyResults),
      tshare('daily.scoreLine', { score: dailyScore, correct: dailyCorrectCount, total: 5 }),
      tshare('result.tag'),
    ].join('\n');

    const result = await shareOrCopy({
      title: tshare('daily.title'),
      text: shareText,
      url: shareLink('/daily'),
    });
    if (result === 'copied') {
      setCopiedShareText(true);
      setTimeout(() => setCopiedShareText(false), 2500);
    }
  };

  return (
    <div className="w-full flex flex-col items-center my-auto">
      <PageHero
        title="Daily Challenge"
        tagline={t('tagline')}
        gradient="from-amber-200 via-yellow-300 to-amber-500"
      >
          <HeroPill>
            <CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--song-accent-text)' }} />
            <span>{dailyInfo?.dateKey || 'Daily Challenge'}</span>
          </HeroPill>

          <HeroPill>
            <span style={{ color: 'var(--song-muted)' }}>{t('score')}</span>
            <strong className="font-mono text-amber-400">{t('points', { points: dailyScore })}</strong>
          </HeroPill>

          <HeroPill color="var(--song-muted)">
            <span>{t('round')} <strong className="text-white">{Math.min(dailyIndex + 1, dailyInfo?.totalRounds || 5)}/{dailyInfo?.totalRounds || 5}</strong></span>
            <HeroPillDivider />
            <span className="text-emerald-400">✓ {dailyCorrectCount}</span>
            <HeroPillDivider />
            <span className="text-amber-400">✕ {dailySkipCount}</span>
          </HeroPill>

          <HeroPillButton
            onClick={() => setLeaderboardOpen(true)}
            background="color-mix(in srgb, #f59e0b 16%, var(--song-surface))"
            borderColor="rgba(245, 158, 11, 0.4)"
            color="#fbbf24"
            title={t('rankingsTitle')}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('rankings')}</span>
          </HeroPillButton>

          <HeroPillButton onClick={() => navigate('/daily/archive')} title={ta('openTitle')}>
            <History className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{ta('open')}</span>
          </HeroPillButton>

          <HeroPillButton
            onClick={() => {
              const nextCat = config.category === 'thai' ? 'international' : config.category === 'international' ? 'all' : 'thai';
              handleConfigChange({ ...config, category: nextCat }, true);
            }}
            color="var(--song-accent-text)"
            title={t('categoryToggleTitle')}
          >
            <span>
              {config.category === 'thai'
                ? tc('category.thai')
                : config.category === 'international'
                  ? tc('category.international')
                  : tc('category.mixed')}
            </span>
          </HeroPillButton>
      </PageHero>

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
              {t('progress', { total: 5 })}
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

        <SetupDisclosure summary={describeSetup({ difficulty: config.difficulty, extras: [t('clipRangeShort', { min: DAILY_TIME_STAGES[0], max: DAILY_TIME_STAGES[DAILY_TIME_STAGES.length - 1] })] })}>
        <div className="w-full flex flex-col items-center gap-2.5">
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
                  title={tc(`difficulty.${lvl}.description`)}
                >
                  {preset.label}
                </button>
              );
            }
          )}
        </div>

        <div className="w-full h-px opacity-30 my-0.5" style={{ backgroundColor: 'var(--song-border)' }} />

        {/* Row 3: Fixed Daily timing (same for every player, set by the server) */}
        <p
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold"
          style={{ color: 'var(--song-muted)' }}
        >
          <Clock className="w-3.5 h-3.5" style={{ color: 'var(--song-accent-text)' }} aria-hidden="true" />
          <span>
            {t('clipRangeFixed', { min: DAILY_TIME_STAGES[0], max: DAILY_TIME_STAGES[DAILY_TIME_STAGES.length - 1] })}
          </span>
        </p>
        </div>
        </SetupDisclosure>
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
              {t('finished.kicker')}
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">
              {t('finished.heading', { total: 5 })}
            </h2>
            <p className="text-xs" style={{ color: 'var(--song-muted)' }}>
              {t('finished.subheading')}
            </p>
            <div className="text-4xl font-black font-mono my-3" style={{ color: 'var(--song-accent-text)' }}>
              {t('points', { points: dailyScore })}
            </div>
            <div className="text-xs mb-4" style={{ color: 'var(--song-muted)' }}>
              {t('finished.breakdown', {
                correct: dailyCorrectCount,
                wrong: dailyResults.filter((result) => result === 'wrong').length,
                skipped: dailySkipCount,
                expired: dailyResults.filter((result) => result === 'expired').length,
                seconds: Math.round(dailyTotalAnswerTimeMs / 1000),
              })}
            </div>

            <div className="flex items-center gap-2 mb-6">
              {dailyResults.map((res, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border"
                  style={
                    res === 'correct'
                      ? { backgroundColor: '#22c55e', borderColor: '#22c55e', color: '#fff' }
                      : res === 'skipped'
                        ? { backgroundColor: '#f59e0b', borderColor: '#f59e0b', color: '#111827' }
                        : { backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }
                  }
                >
                  {res === 'correct' ? '✓' : res === 'skipped' ? '−' : '✕'}
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
                  <span>{t('finished.copied')}</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-white" />
                  <span>{t('finished.share')}</span>
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
                <span>{t('finished.viewRankings')}</span>
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
                <span>{t('finished.practice')}</span>
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
              {loadingRound ? t('retrying') : t('retry')}
            </button>
          </div>
        ) : loadingRound || !dailyInfo || config.mode !== 'daily' || !round ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2
              className="w-10 h-10 animate-spin"
              style={{ color: 'var(--song-accent-text)' }}
            />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              {t('loading', { total: 5 })}
            </p>
          </div>
        ) : outcome && revealSong ? (
          <>
          <div className="text-center text-sm font-bold mb-2 flex items-center justify-center gap-2 flex-wrap" role="status" aria-live="polite">
            {dailyFeedback?.dailyResult === 'correct' && (
              <span className="text-emerald-400">
                ✓ {t('feedback.correct', { points: dailyFeedback.scoreDelta ?? 0 })}
                {Boolean(dailyFeedback.speedBonus) && ` ${t('feedback.speedBonus', { bonus: dailyFeedback.speedBonus ?? 0 })}`}
                {typeof dailyFeedback.elapsedTimeMs === 'number' && ` · ${(dailyFeedback.elapsedTimeMs / 1000).toFixed(1)}s`}
              </span>
            )}
            {dailyFeedback?.dailyResult === 'wrong' && (
              <span className="text-red-400">✕ {t('feedback.wrong')}</span>
            )}
            {dailyFeedback?.dailyResult === 'skipped' && (
              <span className="text-amber-400">− {t('feedback.skipped')}</span>
            )}
            {dailyFeedback?.dailyResult === 'expired' && (
              <span className="text-neutral-400">{t('feedback.expired')}</span>
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
                {t('feedback.wrongKeepListening')}
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
                  {t('historyHeading', { used: history.length, total: stages.length })}
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
                      <StatusMark status={item.status} />
                      <span className="truncate">{item.trackId === 'skipped' ? tgame('history.skipped') : item.title}</span>
                      {item.artistName && item.artistName !== '—' && (
                        <span className="opacity-60 text-[11px] truncate">• {item.artistName}</span>
                      )}
                    </div>
                    <span
                      className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-xl shrink-0 ml-2"
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
