'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarDays, Check, ExternalLink, Loader2, Play, RotateCcw, Share2 } from 'lucide-react';
import { useRouter } from '../../../../i18n/navigation';
import { PageHero } from '../../../../components/PageHero';
import { BackButton } from '../../../../components/BackButton';
import { AudioPlayer } from '../../../../components/AudioPlayer';
import { GuessAutocomplete } from '../../../../components/GuessAutocomplete';
import { StageSquares, type GuessStatus } from '../../../../components/StatusMark';
import { ErrorText, PrimaryButton, RoomCard, SecondaryButton } from '../../../../components/room/RoomControls';
import { useAudioController } from '../../../../hooks/useAudioController';
import { useConsent } from '../../../../context/ConsentContext';
import { buildShareGrid, difficultyName, shareLink, shareOrCopy } from '../../../../lib/shareUtils';
import { DailyFinishedCard, DailyResultDots, type DailyRoundResult } from '../../../../components/daily/DailyResults';
import { recordSongResult, spotifySearchUrl } from '../../../../lib/songHistory';
import { practiceKey, readPracticeHistory, savePracticeResult, type ArchivePracticeResult } from '../../../../lib/archiveHistory';
import {
  DAILY_ROUND_COUNT,
  DAILY_STAGE_SCORES,
  type CategoryType,
  type DifficultyLevel,
  type RoundActionResponse,
  type RoundStartResponse,
  type Song,
  type SongSuggestion,
  toDailyRevealSong,
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

const intlLocale = (locale: string) => (locale === 'th' ? 'th-TH' : 'en-GB');

function dayParts(dateKey: string, locale: string) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlLocale(locale), { ...o, timeZone: 'UTC' }).format(d);
  return { weekday: f({ weekday: 'short' }), day: f({ day: 'numeric' }), date: f({ day: 'numeric', month: 'short', year: 'numeric' }) };
}

function monthLabel(month: string, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`)
  );
}

const LATEST = 'latest';

/** Compact single-choice chip row; scrolls sideways on narrow screens instead of wrapping. */
function ChipRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--song-muted)' }}>{label}</p>
      <div role="radiogroup" aria-label={label} className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className="shrink-0 min-h-10 whitespace-nowrap rounded-full border px-3.5 text-sm font-bold transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--song-accent)]"
              style={
                active
                  ? { backgroundColor: 'var(--song-accent)', borderColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }
                  : { backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)', color: 'var(--song-text)' }
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DailyArchivePage() {
  const t = useTranslations('Archive');
  const locale = useLocale();
  const router = useRouter();
  const { consent } = useConsent();
  const [category, setCategory] = useState<CategoryType>('all');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('easy');
  const [month, setMonth] = useState<string>(LATEST);
  const [days, setDays] = useState<ArchiveDay[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [practice, setPractice] = useState<Record<string, ArchivePracticeResult>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [months, setMonths] = useState<string[]>([]);

  useEffect(() => setPractice(readPracticeHistory()), [consent]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setDays(null);
      setLoadError(false);
      try {
        const params = new URLSearchParams({ category, difficulty });
        if (month !== LATEST) params.set('month', month);
        const res = await fetch(`/api/daily/archive?${params}`, { cache: 'no-store', signal });
        const json = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(json?.data?.days)) throw new Error('archive');
        setDays(json.data.days as ArchiveDay[]);
        if (Array.isArray(json.data.months)) {
          setMonths((json.data.months as unknown[]).filter((m): m is string => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)));
        }
      } catch {
        if (!signal?.aborted) setLoadError(true);
      }
    },
    [category, difficulty, month]
  );

  useEffect(() => {
    // Abort a slower earlier request so a quick filter change can't show the wrong list.
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const onFinished = useCallback(
    (dateKey: string, result: ArchivePracticeResult) => {
      setPractice(savePracticeResult(practiceKey(dateKey, category, difficulty), result));
    },
    [category, difficulty]
  );

  // Latest view: group the days under month headings.
  const groups = useMemo(() => {
    const out: Array<{ month: string; days: ArchiveDay[] }> = [];
    for (const day of days ?? []) {
      const m = day.dateKey.slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.month === m) last.days.push(day);
      else out.push({ month: m, days: [day] });
    }
    return out;
  }, [days]);

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-3 sm:gap-4 pb-10">
      <PageHero title={t('title')} tagline={t('tagline')} gradient="from-amber-200 via-yellow-300 to-amber-500">
        <BackButton href="/daily" label={t('back')} />
      </PageHero>

      {playing ? (
        <ArchivePlayer
          key={`${playing}|${category}|${difficulty}`}
          dateKey={playing}
          category={category}
          difficulty={difficulty}
          onFinished={onFinished}
          onExit={() => setPlaying(null)}
          onToday={() => router.push('/daily')}
        />
      ) : (
        <>
          <RoomCard className="flex flex-col gap-3">
            <ChipRow
              label={t('songs')}
              value={category}
              options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
              onChange={setCategory}
            />
            <ChipRow
              label={t('difficulty')}
              value={difficulty}
              options={DIFFICULTIES.map((d) => ({ value: d, label: difficultyName(d) }))}
              onChange={setDifficulty}
            />
            <div>
              <label htmlFor="archive-month" className="block text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--song-muted)' }}>
                {t('month')}
              </label>
              <select
                id="archive-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full min-h-11 rounded-xl border px-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--song-accent)]"
                style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)', color: 'var(--song-text)' }}
              >
                <option value={LATEST}>{t('monthLatest')}</option>
                {/* Keep the chosen month listed even if this level has no days in it. */}
                {(month !== LATEST && !months.includes(month) ? [month, ...months] : months).map((m) => (
                  <option key={m} value={m}>{monthLabel(m, locale)}</option>
                ))}
              </select>
            </div>
            <p className="text-xs" style={{ color: 'var(--song-muted)' }}>{t('practiceNote')}</p>
          </RoomCard>

          <RoomCard className="!p-3 sm:!p-5">
            {loadError ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <ErrorText>{t('loadError')}</ErrorText>
                <SecondaryButton onClick={() => void load()}>{t('retry')}</SecondaryButton>
              </div>
            ) : days === null ? (
              <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm font-bold" style={{ color: 'var(--song-muted)' }}>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('loading')}
              </p>
            ) : days.length === 0 ? (
              <div className="py-6 px-2 text-center flex flex-col items-center gap-2">
                <CalendarDays className="w-6 h-6" style={{ color: 'var(--song-muted)' }} aria-hidden="true" />
                <p className="text-sm font-bold" style={{ color: 'var(--song-text)' }}>{month === LATEST ? t('empty') : t('emptyMonth')}</p>
                {difficulty !== 'easy' && <p className="text-xs" style={{ color: 'var(--song-muted)' }}>{t('emptyHarder')}</p>}
                {month !== LATEST && (
                  <button type="button" onClick={() => setMonth(LATEST)} className="mt-1 text-xs font-bold underline underline-offset-4" style={{ color: 'var(--song-accent-text)' }}>
                    {t('monthLatest')}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="px-1 text-xs font-bold" style={{ color: 'var(--song-muted)' }} aria-live="polite">
                  {t('dayCount', { count: days.length })}
                </p>
                {groups.map((group) => (
                  <section key={group.month} aria-label={monthLabel(group.month, locale)} className="flex flex-col gap-2">
                    {month === LATEST && (
                      <h2 className="px-1 text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
                        {monthLabel(group.month, locale)}
                      </h2>
                    )}
                    <ul className="flex flex-col gap-2">
                      {group.days.map((day) => {
                        const mine = practice[practiceKey(day.dateKey, category, difficulty)];
                        const parts = dayParts(day.dateKey, locale);
                        return (
                          <li
                            key={day.dateKey}
                            className="flex items-center gap-3 rounded-xl border p-2 pr-2.5"
                            style={{ borderColor: 'var(--song-border)', backgroundColor: 'var(--song-surface-soft)' }}
                          >
                            <div
                              className="w-12 shrink-0 rounded-lg py-1.5 text-center"
                              style={{ backgroundColor: 'color-mix(in srgb, var(--song-accent) 14%, var(--song-surface))', color: 'var(--song-accent-text)' }}
                              aria-hidden="true"
                            >
                              <span className="block text-[10px] font-black uppercase leading-tight">{parts.weekday}</span>
                              <span className="block text-lg font-black leading-tight tabular-nums">{parts.day}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate" style={{ color: 'var(--song-text)' }}>{parts.date}</p>
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-bold" style={{ color: 'var(--song-muted)' }}>
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
                                {!day.official && !mine && <span>{t('notPlayed')}</span>}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPlaying(day.dateKey)}
                              className="shrink-0 min-h-10 min-w-10 rounded-full px-3.5 text-sm font-extrabold inline-flex items-center justify-center gap-1.5 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--song-accent)]"
                              style={
                                mine
                                  ? { backgroundColor: 'var(--song-surface)', color: 'var(--song-text)', border: '1px solid var(--song-border)' }
                                  : { backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }
                              }
                              aria-label={`${mine ? t('playAgain') : t('play')} · ${formatDate(day.dateKey, locale)}`}
                            >
                              {mine ? <RotateCcw className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4 fill-current" aria-hidden="true" />}
                              <span className="hidden min-[400px]:inline">{mine ? t('playAgain') : t('play')}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
            {consent && !consent.preferences && days && days.length > 0 && (
              <p className="mt-3 px-1 text-xs" style={{ color: 'var(--song-muted)' }}>{t('rememberHint')}</p>
            )}
          </RoomCard>
        </>
      )}
    </div>
  );
}

// --- One day's practice game ------------------------------------------------------------------

/** Per round: the status of each stage the player reached. */
type RoundRecord = { statuses: GuessStatus[]; points: number; reveal?: Song; result?: DailyRoundResult };

function ArchivePlayer({
  dateKey,
  category,
  difficulty,
  onFinished,
  onExit,
  onToday,
}: {
  dateKey: string;
  category: CategoryType;
  difficulty: DifficultyLevel;
  onFinished: (dateKey: string, result: ArchivePracticeResult) => void;
  onExit: () => void;
  onToday: () => void;
}) {
  const t = useTranslations('Archive');
  const tDaily = useTranslations('Daily');
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
    if (data.reveal) recordSongResult(data.reveal, points > 0 ? 'correct' : 'failed');
    const result: DailyRoundResult = points > 0 ? 'correct' : status === 'skipped' ? 'skipped' : 'wrong';
    setRecords((prev) => {
      const next = [...prev];
      const rec = next[roundIndex] ?? { statuses: [], points: 0 };
      next[roundIndex] = { statuses: [...rec.statuses, status], points, reveal: data.reveal, result };
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

  const guess = async (song: SongSuggestion) => {
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

  const results: DailyRoundResult[] = useMemo(
    () => Array.from({ length: DAILY_ROUND_COUNT }, (_, i) => records[i]?.result ?? 'pending'),
    [records]
  );
  const rows = useMemo(
    () => results.map((result, i) => ({ result, song: records[i]?.reveal ? toDailyRevealSong(records[i].reveal!) : null, points: records[i]?.points })),
    [records, results]
  );

  const exit = () => {
    audio.stop();
    onExit();
  };

  const header = (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
            {formatDate(dateKey, locale)} · {difficultyName(difficulty)}
          </p>
          {!finished && (
            <p className="text-base font-extrabold" style={{ color: 'var(--song-text)' }}>
              {t('round', { current: Math.min(roundIndex + 1, DAILY_ROUND_COUNT), total: DAILY_ROUND_COUNT })}
            </p>
          )}
        </div>
        <BackButton onClick={exit} label={t('chooseAnotherShort')} ariaLabel={t('chooseAnother')} className="shrink-0" />
      </div>
      {!finished && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
          style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
            {tDaily('progress', { total: DAILY_ROUND_COUNT })}
          </span>
          <DailyResultDots results={results} activeIndex={current?.reveal ? undefined : roundIndex} />
        </div>
      )}
    </div>
  );

  if (finished) {
    return (
      <RoomCard>
        {header}
        <DailyFinishedCard
          kicker={t('finishedKicker')}
          heading={t('finishedHeading', { total: DAILY_ROUND_COUNT })}
          subheading={t('finishedSub')}
          scoreLabel={t('resultScore', { score: total })}
          rows={rows}
        >
          <PrimaryButton onClick={() => void share()}>
            <span className="flex items-center justify-center gap-2" aria-live="polite">
              <Share2 className="w-4 h-4" aria-hidden="true" /> {copied ? t('copied') : t('share')}
            </span>
          </PrimaryButton>
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <SecondaryButton onClick={exit}>
              <span className="flex items-center justify-center gap-1.5"><CalendarDays className="w-4 h-4" aria-hidden="true" /> {t('chooseAnother')}</span>
            </SecondaryButton>
            <SecondaryButton onClick={onToday}>
              <span className="flex items-center justify-center gap-1.5"><Play className="w-4 h-4" aria-hidden="true" /> {t('today')}</span>
            </SecondaryButton>
          </div>
        </DailyFinishedCard>
      </RoomCard>
    );
  }

  const attemptSquares = current && current.statuses.length > 0 && (
    <div className="flex items-center justify-center gap-2 text-[11px] font-bold" style={{ color: 'var(--song-muted)' }}>
      <span>{t('attempts')}</span>
      <StageSquares
        statuses={[...current.statuses, ...Array<GuessStatus>(Math.max(0, stages.length - current.statuses.length)).fill('unused')]}
        label={t('attempts')}
      />
    </div>
  );

  return (
    <RoomCard className="flex flex-col gap-4">
      {header}
      {error ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <ErrorText>{t('roundError')}</ErrorText>
          <SecondaryButton onClick={() => void startRound(roundIndex)}>{t('retry')}</SecondaryButton>
        </div>
      ) : current?.reveal ? (
        <div className="flex flex-col items-center gap-4 text-center animate-in fade-in duration-300">
          {current.reveal.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.reveal.artworkUrl}
              alt=""
              width={144}
              height={144}
              className="w-36 h-36 rounded-2xl object-cover shadow-2xl border"
              style={{ borderColor: 'var(--song-border)' }}
            />
          ) : (
            <span className="w-36 h-36 rounded-2xl" style={{ backgroundColor: 'var(--song-border)' }} aria-hidden="true" />
          )}
          <div className="min-w-0 w-full">
            <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>{t('theSongWas')}</p>
            <p className="text-xl font-extrabold truncate" style={{ color: 'var(--song-text)' }}>{current.reveal.title}</p>
            <p className="text-sm truncate" style={{ color: 'var(--song-muted)' }}>{current.reveal.artistName}</p>
            <p
              role="status"
              className="inline-block mt-2 rounded-full px-3 py-1 text-sm font-extrabold"
              style={
                current.points
                  ? { backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }
                  : { backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#f87171' }
              }
            >
              {current.points ? t('correct', { points: current.points }) : t('missed')}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold" style={{ color: 'var(--song-muted)' }}>
            {current.reveal.trackViewUrl && (
              <a href={current.reveal.trackViewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 py-1 underline underline-offset-4">
                Apple Music <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            )}
            <a href={spotifySearchUrl(current.reveal.title, current.reveal.artistName)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 py-1 underline underline-offset-4">
              Spotify <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>
          {attemptSquares}
          <div className="w-full">
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
        </div>
      ) : !round ? (
        <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm font-bold" style={{ color: 'var(--song-muted)' }}>
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--song-accent-text)' }} aria-hidden="true" />
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
          {attemptSquares}
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
        </>
      )}
    </RoomCard>
  );
}
