'use client';
import React, { useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { ModeSelector } from '../../components/ModeSelector';
import { AudioPlayer } from '../../components/AudioPlayer';
import { GuessAutocomplete } from '../../components/GuessAutocomplete';
import { SpinningAlbumArt } from '../../components/SpinningAlbumArt';
import { Flame, Loader2, Trophy, Zap } from 'lucide-react';

const PlayPage: React.FC = () => {
  const {
    config,
    handleConfigChange,
    artists,
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
      {/* BeatDrop Wordmark Slot */}
      <div className="mb-3 text-center overflow-visible">
        <div className="songspot-wordmark px-4 pb-0.5 italic bg-gradient-to-b from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
          BeatDrop
        </div>
        <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.24em] opacity-45 mt-0.5" style={{ color: 'var(--song-muted)' }}>
          HEAR LESS. KNOW MORE.
        </p>
        {/* Streak Stats Pill & Active Filter Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {/* Live Win Streaks Pill */}
          <div
            className="flex items-center gap-2.5 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full border text-xs font-bold shadow-sm"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            <span className="flex items-center gap-1" title="ชนะติดต่อกันรอบปัจจุบัน (Current Streak)">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>Streak: <span className="font-extrabold text-orange-400">{streak}</span></span>
            </span>
            <span className="opacity-30">|</span>
            <span className="flex items-center gap-1" title="สถิติชนะติดต่อกันสูงสุด (Best Streak)">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Best: <span className="font-extrabold text-amber-400">{bestStreak}</span></span>
            </span>
            {fastestTime !== null && (
              <>
                <span className="opacity-30">|</span>
                <span className="flex items-center gap-1" title="เวลาทายถูกเร็วที่สุด (Fastest Guess)">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Fastest: <span className="font-extrabold text-emerald-400">{fastestTime}s</span></span>
                </span>
              </>
            )}
          </div>

          <span
            className="text-xs font-bold px-2.5 py-1 sm:py-1.5 rounded-full border"
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
          {config.artistName && config.artistName !== 'any' && (
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
          {config.yearFilter && config.yearFilter !== 'any' && (
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
          {config.genreFilter && config.genreFilter !== 'any' && (
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
        </div>
      </div>

      {/* Filter Reels & Difficulty Selector */}
      <ModeSelector
        config={config}
        onChangeConfig={handleConfigChange}
        artists={artists}
        category={config.category}
        poolSize={round?.poolSize || 0}
        onReroll={() => startNewRound(config)}
      />

      {/* Game Arena Card */}
      <div
        className="w-full max-w-xl rounded-3xl p-4 sm:p-6 border shadow-2xl relative mt-3 transition-colors duration-200"
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
              กำลังสุ่มเพลงใหม่...
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
                mode={config.mode}
                artistFilter={config.artistName}
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


export default PlayPage;
