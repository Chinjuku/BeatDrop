'use client';
import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useGame } from '../../../context/GameContext';
import { PageHero, HeroPill } from '../../../components/PageHero';
import { ModeSelector } from '../../../components/ModeSelector';
import { AudioPlayer } from '../../../components/AudioPlayer';
import { GuessAutocomplete } from '../../../components/GuessAutocomplete';
import { SpinningAlbumArt } from '../../../components/SpinningAlbumArt';
import { Flame, Loader2, Trophy, X, Zap } from 'lucide-react';

const PlayPage: React.FC = () => {
  const t = useTranslations('Play');
  const tc = useTranslations('Common');
  const tgame = useTranslations('Game');
  const {
    config,
    handleConfigChange,
    artists,
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
    setAddArtistOpen,
    startNewRound,
  } = useGame();

  // Ensure mode is standard or scoped when visiting PlayPage
  useEffect(() => {
    if (config.mode === 'daily' || config.mode === 'guesser') {
      handleConfigChange({ ...config, mode: 'standard' }, true);
    }
  }, [config.mode]);

  return (
    <div className="w-full flex flex-col items-center my-auto">
      <PageHero
        title="BeatDrop"
        tagline="HEAR LESS. KNOW MORE."
        gradient="from-white via-neutral-200 to-neutral-400"
      >
          <HeroPill className="gap-1.5 sm:gap-2.5">
            <span className="flex items-center gap-1" title={tc('stats.streakTitle')}>
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>
                {tc('stats.streak')}:{' '}
                <span className="font-extrabold text-orange-400" suppressHydrationWarning>
                  {streak}
                </span>
              </span>
            </span>
            <span className="opacity-30">|</span>
            <span className="flex items-center gap-1" title={tc('stats.bestTitle')}>
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {tc('stats.best')}:{' '}
                <span className="font-extrabold text-amber-400" suppressHydrationWarning>
                  {bestStreak}
                </span>
              </span>
            </span>
            {fastestTime !== null && (
              <>
                <span className="opacity-30">|</span>
                <span className="flex items-center gap-1" title={tc('stats.fastestTitle')}>
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {tc('stats.fastest')}:{' '}
                    <span className="font-extrabold text-emerald-400" suppressHydrationWarning>
                      {fastestTime}s
                    </span>
                  </span>
                </span>
              </>
            )}
          </HeroPill>

          <HeroPill color="var(--song-accent-text)">
            {config.category === 'thai'
              ? `🇹🇭 ${t('categoryMode.thai')}`
              : config.category === 'international'
                ? `🌍 ${t('categoryMode.international')}`
                : `🔥 ${t('categoryMode.mixed')}`}
          </HeroPill>
          {config.artistName && config.artistName !== 'any' && (
            <HeroPill borderColor="var(--song-accent)">
              <span>🎤 {t('filter.artist', { value: config.artistName })}</span>
              <button
                type="button"
                onClick={() => handleConfigChange({ ...config, artistName: undefined }, true)}
                className="hover:text-rose-400 p-0.5 rounded transition"
                title={t('filter.clearArtist')}
                aria-label={t('filter.clearArtist')}
              >
                <X className="w-3 h-3" />
              </button>
            </HeroPill>
          )}
          {config.yearFilter && config.yearFilter !== 'any' && (
            <HeroPill borderColor="var(--song-accent)">
              <span>📅 {t('filter.era', { value: config.yearFilter })}</span>
              <button
                type="button"
                onClick={() => handleConfigChange({ ...config, yearFilter: 'any' }, true)}
                className="hover:text-rose-400 p-0.5 rounded transition"
                title={t('filter.clearEra')}
                aria-label={t('filter.clearEra')}
              >
                <X className="w-3 h-3" />
              </button>
            </HeroPill>
          )}
          {config.genreFilter && config.genreFilter !== 'any' && (
            <HeroPill borderColor="var(--song-accent)">
              <span>🎸 {t('filter.genre', { value: config.genreFilter })}</span>
              <button
                type="button"
                onClick={() => handleConfigChange({ ...config, genreFilter: 'any' }, true)}
                className="hover:text-rose-400 p-0.5 rounded transition"
                title={t('filter.clearGenre')}
                aria-label={t('filter.clearGenre')}
              >
                <X className="w-3 h-3" />
              </button>
            </HeroPill>
          )}
      </PageHero>

      {/* Filter Reels & Difficulty Selector */}
      <ModeSelector
        config={config}
        onChangeConfig={handleConfigChange}
        artists={artists}
        category={config.category}
        poolSize={round?.poolSize || 0}
        onReroll={() => startNewRound(config)}
        onOpenAddArtist={() => setAddArtistOpen(true)}
      />

      {/* Game Arena Card */}
      <div
        className="w-full max-w-xl rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 border shadow-2xl relative mt-2 sm:mt-3 transition-colors duration-200"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
        }}
      >
        {loadingRound ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2
              className="w-10 h-10 animate-spin"
              style={{ color: 'var(--song-accent-text)' }}
            />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              {t('loading')}
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
                      <span className="font-bold">
                        {item.status === 'correct' ? '🟩' : item.status === 'wrong' ? '🟥' : '🟨'}
                      </span>
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
                mode={config.mode}
                artistFilter={config.artistName}
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


export default PlayPage;
