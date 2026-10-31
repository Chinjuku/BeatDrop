'use client';
import React, { useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { AudioPlayer } from '../../components/AudioPlayer';
import { SpinningAlbumArt } from '../../components/SpinningAlbumArt';
import { TimeRangeSelector } from '../../components/TimeRangeSelector';
import { DIFFICULTY_PRESETS, DifficultyLevel, GameConfig } from '../../types';
import { Disc, Flame, ListChecks, Loader2, Trophy } from 'lucide-react';

const SongGuesserPage: React.FC = () => {
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
    streak,
    bestStreak,
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
    handleNextRoundOrDaily,
    setTicketModalOpen,
  } = useGame();

  // Ensure config mode is guesser
  useEffect(() => {
    if (config.mode !== 'guesser') {
      handleConfigChange(
        {
          ...config,
          mode: 'guesser',
        },
        true
      );
    }
  }, [config.mode]);

  return (
    <div className="w-full flex flex-col items-center my-auto">
      {/* Header Banner */}
      <div className="mb-3 text-center overflow-visible">
        <div className="songspot-wordmark px-4 pb-0.5 italic bg-gradient-to-b from-purple-200 via-fuchsia-300 to-indigo-500 bg-clip-text text-transparent">
          Song Guesser
        </div>
        <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.24em] text-purple-300/60 mt-0.5">
          HEAR LESS. PICK FASTER.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {/* Live Streak Pill */}
          <div
            className="flex items-center gap-2.5 px-3.5 py-1 sm:py-1.5 rounded-full border text-xs font-bold shadow-sm"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            <span className="flex items-center gap-1" title="Current Win Streak">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>Streak: <strong className="text-orange-400">{streak}</strong></span>
            </span>
            <span className="opacity-30">|</span>
            <span className="flex items-center gap-1" title="Best Win Streak">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Best: <strong className="text-amber-400">{bestStreak}</strong></span>
            </span>
          </div>

          <span
            className="text-xs font-bold px-3 py-1 sm:py-1.5 rounded-full border flex items-center gap-1.5 shadow-sm"
            style={{
              backgroundColor: '#b57aff',
              borderColor: '#b57aff',
              color: '#07110c',
            }}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>4 CHOICES</span>
          </span>
          <span
            className="text-xs font-bold px-2.5 py-1 sm:py-1.5 rounded-full border"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-accent-text)',
            }}
          >
            {config.category === 'thai'
              ? '🇹🇭 เพลงไทย'
              : config.category === 'international'
                ? '🌍 เพลงสากล'
                : '🔥 รวมไทย & สากล'}
          </span>
        </div>
      </div>

      {/* Difficulty & Time Range Control Bar */}
      <div
        className="w-full max-w-xl p-3 rounded-2xl border flex flex-col items-center justify-center gap-2.5 mb-3"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
        }}
      >
        {/* Row 1: ระดับความยาก (แถวแนวนอน) */}
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

      {/* Game Arena Card */}
      <div
        className="w-full max-w-xl rounded-3xl p-4 sm:p-6 border shadow-2xl relative transition-colors duration-200"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
        }}
      >
        {loadingRound ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2
              className="w-10 h-10 animate-spin"
              style={{ color: '#b57aff' }}
            />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              กำลังสุ่มโจทย์ 4 ตัวเลือก...
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

            {/* 4-Choice Option Grid */}
            {round?.choices && round.choices.length > 0 && (
              <div className="w-full mt-6 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold px-1">
                  <span className="uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#b57aff' }}>
                    <ListChecks className="w-4 h-4" />
                    <span>เลือกคำตอบจาก 4 ตัวเลือก</span>
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
                                  borderColor: '#b57aff',
                                  color: '#b57aff',
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
                          <div className="text-[11px] truncate opacity-70">
                            {choice.artistName}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


export default SongGuesserPage;
