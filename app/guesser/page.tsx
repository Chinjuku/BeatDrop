'use client';
import React, { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { PageHero, HeroPill, HeroPillDivider } from '../../components/PageHero';
import { AudioPlayer } from '../../components/AudioPlayer';
import { SpinningAlbumArt } from '../../components/SpinningAlbumArt';
import { TimeRangeSelector } from '../../components/TimeRangeSelector';
import { SetupDisclosure, describeSetup } from '../../components/SetupDisclosure';
import { DEFAULT_TIME_STAGES, DIFFICULTY_PRESETS, DifficultyLevel, GameConfig } from '../../types';
import { Flag, Flame, ListChecks, Loader2, SkipForward, Trophy } from 'lucide-react';

const SongGuesserPage: React.FC = () => {
  const {
    config,
    handleConfigChange,
    handleDailyDifficultySelect,
    round,
    loadingRound,
    roundLoadError,
    retryRound,
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
    guesserSkipCount,
    guesserFeedback,
    handleNextRoundOrDaily,
    setTicketModalOpen,
  } = useGame();
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedChoiceId(null);
  }, [round?.roundToken]);

  // Ensure config mode is guesser and default timeRangePreset is standard
  useEffect(() => {
    if (config.mode !== 'guesser') {
      handleConfigChange(
        {
          ...config,
          mode: 'guesser',
          timeRangePreset: config.timeRangePreset || 'standard',
          customStages:
            config.customStages && config.customStages.length >= 2
              ? config.customStages
              : DEFAULT_TIME_STAGES,
        },
        true
      );
    }
  }, [config.mode]);

  return (
    <div className="w-full flex flex-col items-center my-auto">
      <PageHero
        title="Song Guesser"
        tagline="HEAR LESS. PICK FASTER."
        gradient="from-purple-200 via-fuchsia-300 to-indigo-500"
        taglineColor="rgb(216 180 254 / 0.6)"
      >
          <HeroPill className="gap-2.5">
            <span className="flex items-center gap-1" title="Current Win Streak">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>Streak: <strong className="text-orange-400">{streak}</strong></span>
            </span>
            <HeroPillDivider />
            <span className="flex items-center gap-1" title="Best Win Streak">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Best: <strong className="text-amber-400">{bestStreak}</strong></span>
            </span>
          </HeroPill>

          <HeroPill tone="accent" accent="#b57aff" color="#07110c">
            <ListChecks className="w-3.5 h-3.5" />
            <span>4 CHOICES</span>
          </HeroPill>
          <HeroPill color="var(--song-muted)">ข้าม: {guesserSkipCount}</HeroPill>
          <HeroPill color="var(--song-accent-text)">
            {config.category === 'thai'
              ? '🇹🇭 เพลงไทย'
              : config.category === 'international'
                ? '🌍 เพลงสากล'
                : '🔥 รวมไทย & สากล'}
          </HeroPill>
      </PageHero>

      {/* Difficulty & Time Range Control Bar (collapsed on phones) */}
      <SetupDisclosure
        className="max-w-xl mb-3"
        summary={describeSetup({ difficulty: config.difficulty, timeRangePreset: config.timeRangePreset })}
      >
      <div
        className="w-full max-w-xl p-3 rounded-2xl border flex flex-col items-center justify-center gap-2.5 sm:mb-3"
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
      </SetupDisclosure>

      {/* Game Arena Card */}
      <div
        className="w-full max-w-xl rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 border shadow-2xl relative transition-colors duration-200"
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
        ) : roundLoadError ? (
          <div className="py-12 px-4 flex flex-col items-center text-center gap-3">
            <p className="text-sm font-bold" role="alert">{roundLoadError}</p>
            <button
              type="button"
              onClick={() => void retryRound()}
              disabled={loadingRound}
              className="min-h-11 rounded-xl px-5 font-extrabold transition hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
            >
              {loadingRound ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        ) : outcome && revealSong ? (
          <>
          <div className="w-full text-center text-sm font-bold mb-2" role="status" aria-live="polite">
            {outcome === 'correct'
              ? 'Correct choice · points recorded through your streak'
              : history.at(-1)?.status === 'skipped'
                ? 'ข้ามแล้ว · ไม่ได้คะแนน'
                : `Incorrect choice${history.at(-1)?.title ? `: ${history.at(-1)?.title} — ${history.at(-1)?.artistName || ''}` : ''}`}
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
            {guesserFeedback && (
              <div className="w-full text-center text-xs font-bold mb-2 text-amber-300" role="status" aria-live="polite">
                {guesserFeedback}
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

            {/* 4-Choice Option Grid */}
            {round?.choices && round.choices.length > 0 && (
              <div className="w-full mt-6 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold px-1">
                  <span className="uppercase tracking-wider flex items-center gap-1.5" style={{ color: '#b57aff' }}>
                    <ListChecks className="w-4 h-4" />
                    <span>เลือกคำตอบจาก 4 ตัวเลือก</span>
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
                        disabled={loadingRound || submittingGuess || !round || alreadyGuessedWrong}
                        onClick={() => {
                          setSelectedChoiceId(choice.id);
                          handleSelectGuess({
                            id: choice.id,
                            title: choice.title,
                            artistName: choice.artistName,
                          });
                        }}
                        className="group relative flex items-center gap-3 p-3 rounded-2xl border text-left transition-all hover:scale-[1.01] disabled:opacity-45 disabled:pointer-events-none"
                        style={
                          alreadyGuessedWrong
                            ? {
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                borderColor: 'rgba(239, 68, 68, 0.45)',
                                color: 'var(--song-muted)',
                              }
                            : selectedChoiceId === choice.id
                            ? {
                                backgroundColor: 'rgba(181, 122, 255, 0.18)',
                                borderColor: '#b57aff',
                                color: 'var(--song-text)',
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
                            className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border"
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
                <div className="flex items-center gap-2 pt-1">
                  {/* Skip / Unlock More Time Button */}
                  <button
                    type="button"
                    onClick={() => void handleSkip(false)}
                    disabled={loadingRound || submittingGuess || !round}
                    className="flex-1 px-4 py-3 min-h-[44px] rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                    style={{
                      backgroundColor: 'var(--song-surface-soft)',
                      borderColor: 'var(--song-border)',
                      color: 'var(--song-text)',
                    }}
                  >
                    {submittingGuess ? (
                      <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    ) : (
                      <SkipForward className="w-4 h-4" style={{ color: '#b57aff' }} />
                    )}
                    <span>
                      {submittingGuess
                        ? 'กำลังตรวจ...'
                        : nextStageSeconds !== null
                          ? `ข้าม (+${nextStageSeconds}s)`
                          : 'ยอมแพ้ / เฉลย'}
                    </span>
                  </button>

                  {/* Dedicated Give Up Button */}
                  <button
                    type="button"
                    onClick={() => void handleSkip(true)}
                    disabled={loadingRound || submittingGuess || !round}
                    className="px-4 py-3 min-h-[44px] rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition hover:brightness-110 flex-shrink-0 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};


export default SongGuesserPage;
