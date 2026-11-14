'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, CalendarDays, Check, Loader2, Play, RotateCcw, Share2 } from 'lucide-react';
import { useRouter } from '../../../../i18n/navigation';
import { PageHero, HeroPillButton } from '../../../../components/PageHero';
import { AudioPlayer } from '../../../../components/AudioPlayer';
import { GuessAutocomplete } from '../../../../components/GuessAutocomplete';
import { StageSquares, type GuessStatus } from '../../../../components/StatusMark';
import { ErrorText, PrimaryButton, RoomCard, SecondaryButton, Segmented } from '../../../../components/room/RoomControls';
import { useAudioController } from '../../../../hooks/useAudioController';
import { useConsent } from '../../../../context/ConsentContext';
import { buildShareGrid, difficultyName, shareLink, shareOrCopy } from '../../../../lib/shareUtils';
import { practiceKey, readPracticeHistory, savePracticeResult, type ArchivePracticeResult } from '../../../../lib/archiveHistory';
import {
  DAILY_ROUND_COUNT,
  DAILY_STAGE_SCORES,
  type CategoryType,
  type DifficultyLevel,
  type RoundActionResponse,
  type RoundStartResponse,
  type Song,
} from '../../../../shared/types';

interface ArchiveDay {
  dateKey: string;
  official?: { roundsPlayed: number; score: number; complete: boolean };
}

const DIFFICULTIES: DifficultyLevel[] = ['easy', 'medium', 'hard', 'expert', 'impossible'];
const CATEGORIES: CategoryType[] = ['all', 'thai', 'international'];

function formatDate(dateKey: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

const gridToStatuses = (grid: string): GuessStatus[] =>
  Array.from(grid).map((ch) => (ch === 'c' ? 'correct' : ch === 's' ? 'skipped' : ch === 'w' ? 'wrong' : 'unused'));

export default function DailyArchivePage() {
  const t = useTranslations('Archive');
  const locale = useLocale();
  const router = useRouter();
  const { consent } = useConsent();
  const [category, setCategory] = useState<CategoryType>('all');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('easy');
  const [days, setDays] = useState<ArchiveDay[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [practice, setPractice] = useState<Record<string, ArchivePracticeResult>>({});
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => setPractice(readPracticeHistory()), [consent]);

  const load = useCallback(async () => {
    setDays(null);
    setLoadError(false);
    try {
      const res = await fetch(`/api/daily/archive?${new URLSearchParams({ category, difficulty })}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(json?.data?.days)) throw new Error('archive');
      setDays(json.data.days as ArchiveDay[]);
    } catch {
      setLoadError(true);
    }
  }, [category, difficulty]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFinished = useCallback(
    (dateKey: string, result: ArchivePracticeResult) => {
      setPractice(savePracticeResult(practiceKey(dateKey, category, difficulty), result));
    },
    [category, difficulty]
  );

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-4 pb-10">
      <PageHero title={t('title')} tagline={t('tagline')} gradient="from-amber-200 via-yellow-300 to-amber-500">
        <HeroPillButton onClick={() => router.push('/daily')} title={t('back')}>
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('back')}</span>
        </HeroPillButton>
      </PageHero>

      {playing ? (
        <ArchivePlayer
          key={`${playing}|${category}|${difficulty}`}
          dateKey={playing}
          category={category}
          difficulty={difficulty}
          onFinished={onFinished}
          onExit={() => setPlaying(null)}
        />
      ) : (
        <>
          <RoomCard className="flex flex-col gap-4">
            <Segmented
              label={t('songs')}
              value={category}
              options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
              onChange={setCategory}
            />
            <Segmented
              label={t('difficulty')}
              value={difficulty}
              options={DIFFICULTIES.map((d) => ({ value: d, label: difficultyName(d) }))}
              onChange={setDifficulty}
            />
            <p className="text-xs font-bold" style={{ color: 'var(--song-muted)' }}>{t('practiceNote')}</p>
          </RoomCard>

          <RoomCard>
            {loadError ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <ErrorText>{t('loadError')}</ErrorText>
                <SecondaryButton onClick={() => void load()}>{t('retry')}</SecondaryButton>
              </div>
            ) : days === null ? (
              <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm font-bold" style={{ color: 'var(--song-muted)' }}>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('loading')}
              </p>
            ) : days.length === 0 ? (
              <div className="py-4 text-center flex flex-col gap-2">
                <p className="text-sm font-bold" style={{ color: 'var(--song-text)' }}>{t('empty')}</p>
                {difficulty !== 'easy' && <p className="text-xs" style={{ color: 'var(--song-muted)' }}>{t('emptyHarder')}</p>}
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {days.map((day) => {
                  const mine = practice[practiceKey(day.dateKey, category, difficulty)];
                  return (
                    <li
                      key={day.dateKey}
                      className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                      style={{ borderColor: 'var(--song-border)', backgroundColor: 'var(--song-surface-soft)' }}
                    >
                      <CalendarDays className="w-4 h-4 shrink-0" style={{ color: 'var(--song-accent-text)' }} aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate" style={{ color: 'var(--song-text)' }}>{formatDate(day.dateKey, locale)}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-bold" style={{ color: 'var(--song-muted)' }}>
                          {day.official &&
                            (day.official.complete ? (
                              <span className="inline-flex items-center gap-1" style={{ color: '#22c55e' }}>
                                <Check className="w-3.5 h-3.5" aria-hidden="true" /> {t('played', { score: day.official.score })}
                              </span>
                            ) : (
                              <span>{t('playedPartial', { rounds: day.official.roundsPlayed })}</span>
                            ))}
                          {mine && (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <StageSquares statuses={gridToStatuses(mine.grid).slice(0, DAILY_ROUND_COUNT)} label={t('practiced', { score: mine.score })} />
                              {t('practiced', { score: mine.score })}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPlaying(day.dateKey)}
                        className="min-h-11 rounded-xl px-4 text-sm font-extrabold inline-flex items-center gap-1.5 transition hover:brightness-110"
                        style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
                        aria-label={`${mine ? t('playAgain') : t('play')} · ${formatDate(day.dateKey, locale)}`}
                      >
                        {mine ? <RotateCcw className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
                        {mine ? t('playAgain') : t('play')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {consent && !consent.preferences && days && days.length > 0 && (
              <p className="mt-3 text-xs" style={{ color: 'var(--song-muted)' }}>{t('rememberHint')}</p>
            )}
          </RoomCard>
        </>
      )}
    </div>
  );
}

// --- One day's practice game ------------------------------------------------------------------

/** Per round: the status of each stage the player reached. */
type RoundRecord = { statuses: GuessStatus[]; points: number; reveal?: Song };

function ArchivePlayer({
  dateKey,
  category,
  difficulty,
  onFinished,
  onExit,
}: {
  dateKey: string;
  category: CategoryType;
  difficulty: DifficultyLevel;
  onFinished: (dateKey: string, result: ArchivePracticeResult) => void;
  onExit: () => void;
}) {
  const t = useTranslations('Archive');
  const locale = useLocale();
  const [roundIndex, setRoundIndex] = useState(0);
  const [round, setRound] = useState<RoundStartResponse | null>(null);
  const [stage, setStage] = useState(0);
  const [records, setRecords] = useState<RoundRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [volume, setVolume] = useState(80);
  const [copied, setCopied] = useState(false);
  /** Set by "See results" after the last song's reveal. */
  const [finished, setFinished] = useState(false);

  const current = records[roundIndex];
  const stages = round?.stages ?? [0.5, 2, 6, 8, 15];

  const audio = useAudioController({ audioUrl: round?.audioUrl ?? null, volume });

  const startRound = useCallback(
    async (index: number) => {
      setBusy(true);
      setError(false);
      try {
        const res = await fetch('/api/daily/archive/round', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dateKey, category, difficulty, roundIndex: index }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data?.roundToken) throw new Error('round');
        setRound(json.data as RoundStartResponse);
        setStage(0);
        setRecords((prev) => {
          const next = [...prev];
          next[index] = { statuses: [], points: 0 };
          return next;
        });
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [category, dateKey, difficulty]
  );

  useEffect(() => {
    void startRound(0);
  }, [startRound]);

  const endRound = (status: GuessStatus, data: RoundActionResponse, points: number) => {
    audio.stop();
    setRecords((prev) => {
      const next = [...prev];
      const rec = next[roundIndex] ?? { statuses: [], points: 0 };
      next[roundIndex] = { statuses: [...rec.statuses, status], points, reveal: data.reveal };
      return next;
    });
    setRound(null);
  };

  const advanceStage = (status: GuessStatus, data: RoundActionResponse) => {
    setRecords((prev) => {
      const next = [...prev];
      const rec = next[roundIndex] ?? { statuses: [], points: 0 };
      next[roundIndex] = { ...rec, statuses: [...rec.statuses, status] };
      return next;
    });
    setRound((r) => (r && data.roundToken ? { ...r, roundToken: data.roundToken } : r));
    setStage(data.stage);
  };

  const act = async (path: '/api/round/guess' | '/api/round/skip', body: Record<string, unknown>) => {
    if (!round || busy) return null;
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roundToken: round.roundToken, ...body }),
      });
      const json = await res.json().catch(() => null);
      return res.ok && json?.code === 0 ? (json.data as RoundActionResponse) : null;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  };

  const guess = async (song: Song) => {
    const data = await act('/api/round/guess', {
      candidateTrackId: song.id,
      candidateTitle: song.title,
      candidateArtist: song.artistName,
    });
    if (!data) return;
    if (data.outcome === 'correct') endRound('correct', data, DAILY_STAGE_SCORES[Math.min(stage, DAILY_STAGE_SCORES.length - 1)]);
    else if (data.outcome === 'failed') endRound('wrong', data, 0);
    else advanceStage('wrong', data);
  };

  const skip = async (giveUp: boolean) => {
    const data = await act('/api/round/skip', { giveUp });
    if (!data) return;
    if (data.outcome === 'failed') endRound(giveUp ? 'wrong' : 'skipped', data, 0);
    else advanceStage('skipped', data);
  };

  const total = useMemo(() => records.reduce((sum, r) => sum + (r?.points ?? 0), 0), [records]);
  // One square per song for the share grid: green / yellow (got it after a skip) / red.
  const songStatuses: GuessStatus[] = useMemo(
    () =>
      Array.from({ length: DAILY_ROUND_COUNT }, (_, i) => {
        const r = records[i];
        if (!r?.reveal) return 'unused';
        if (r.points > 0) return r.statuses.slice(0, -1).some((s) => s !== 'correct') ? 'skipped' : 'correct';
        return 'wrong';
      }),
    [records]
  );

  useEffect(() => {
    if (!finished) return;
    const grid = songStatuses.map((s) => (s === 'correct' ? 'c' : s === 'skipped' ? 's' : s === 'wrong' ? 'w' : '-')).join('');
    onFinished(dateKey, { score: total, grid, at: Date.now() });
    // Save once per completed run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const share = async () => {
    const text = t('shareText', {
      date: formatDate(dateKey, locale),
      difficulty: difficultyName(difficulty),
      grid: buildShareGrid(songStatuses as Parameters<typeof buildShareGrid>[0]),
      score: total,
    });
    const result = await shareOrCopy({ title: t('title'), text, url: shareLink('/daily/archive') });
    if (result === 'copied') {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
          {formatDate(dateKey, locale)} · {difficultyName(difficulty)}
        </p>
        {!finished && (
          <p className="text-sm font-extrabold" style={{ color: 'var(--song-text)' }}>
            {t('round', { current: roundIndex + 1, total: DAILY_ROUND_COUNT })}
          </p>
        )}
      </div>
      <SecondaryButton onClick={() => { audio.stop(); onExit(); }}>
        <span className="flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> {t('chooseAnother')}</span>
      </SecondaryButton>
    </div>
  );

  if (finished) {
    return (
      <RoomCard className="flex flex-col gap-4">
        {header}
        <div className="text-center flex flex-col items-center gap-2">
          <p className="text-3xl font-black" style={{ color: 'var(--song-accent-text)' }}>{t('resultScore', { score: total })}</p>
          <StageSquares statuses={songStatuses} label={t('resultScore', { score: total })} />
        </div>
        <ol className="flex flex-col gap-1.5">
          {records.map((r, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--song-border)', backgroundColor: 'var(--song-surface-soft)' }}>
              <span className="w-5 text-sm font-black" style={{ color: 'var(--song-muted)' }}>{i + 1}</span>
              <span className="flex-1 min-w-0 truncate text-sm font-bold" style={{ color: 'var(--song-text)' }}>
                {r.reveal?.title} <span style={{ color: 'var(--song-muted)' }}>· {r.reveal?.artistName}</span>
              </span>
              <span className="text-sm font-black tabular-nums" style={{ color: r.points ? '#22c55e' : 'var(--song-muted)' }}>{r.points}</span>
            </li>
          ))}
        </ol>
        <PrimaryButton onClick={() => void share()}>
          <span className="flex items-center justify-center gap-2" aria-live="polite">
            <Share2 className="w-4 h-4" aria-hidden="true" /> {copied ? t('copied') : t('share')}
          </span>
        </PrimaryButton>
      </RoomCard>
    );
  }

  return (
    <RoomCard className="flex flex-col gap-4">
      {header}
      {error ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <ErrorText>{t('roundError')}</ErrorText>
          <SecondaryButton onClick={() => void startRound(roundIndex)}>{t('retry')}</SecondaryButton>
        </div>
      ) : current?.reveal ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {current.reveal.artworkUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.reveal.artworkUrl} alt="" width={72} height={72} className="w-[72px] h-[72px] rounded-xl object-cover" />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>{t('theSongWas')}</p>
              <p className="text-lg font-extrabold truncate" style={{ color: 'var(--song-text)' }}>{current.reveal.title}</p>
              <p className="text-sm truncate" style={{ color: 'var(--song-muted)' }}>{current.reveal.artistName}</p>
              <p role="status" className="text-sm font-extrabold mt-1" style={{ color: current.points ? '#22c55e' : '#f87171' }}>
                {current.points ? t('correct', { points: current.points }) : t('missed')}
              </p>
            </div>
          </div>
          <PrimaryButton
            onClick={() => {
              const next = roundIndex + 1;
              if (next < DAILY_ROUND_COUNT) {
                setRoundIndex(next);
                void startRound(next);
              } else {
                setFinished(true);
              }
            }}
          >
            {roundIndex + 1 < DAILY_ROUND_COUNT ? t('next') : t('finish')}
          </PrimaryButton>
        </div>
      ) : !round ? (
        <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm font-bold" style={{ color: 'var(--song-muted)' }}>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        </p>
      ) : (
        <>
          <AudioPlayer
            stages={stages}
            currentStage={stage}
            audioState={audio.state}
            progress={audio.progress}
            onTogglePlay={() => (audio.state === 'playing' ? audio.stop() : audio.playSnippet(stages[stage]))}
            volume={volume}
            onVolumeChange={setVolume}
            disabled={busy}
          />
          <GuessAutocomplete
            category={category}
            mode="standard"
            onSelectGuess={(song) => void guess(song)}
            onSkip={() => void skip(false)}
            onGiveUp={() => void skip(true)}
            nextStageSeconds={stage + 1 < stages.length ? stages[stage + 1] : null}
            disabled={busy}
            submitting={busy}
          />
          {current && current.statuses.length > 0 && (
            <StageSquares
              statuses={[...current.statuses, ...Array<GuessStatus>(Math.max(0, stages.length - current.statuses.length)).fill('unused')]}
              label={t('round', { current: roundIndex + 1, total: DAILY_ROUND_COUNT })}
            />
          )}
        </>
      )}
    </RoomCard>
  );
}
