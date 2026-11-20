import type { DailyChallengeInfo, DailyRevealSong, RoundStartResponse } from './types';
import { DAILY_ROUND_COUNT } from './types';

export class DailyChallengeLoadError extends Error {
  readonly status?: number;
  readonly apiCode?: unknown;
  readonly apiMessage?: string;

  constructor(details: { status?: number; apiCode?: unknown; apiMessage?: string } = {}) {
    super('Daily Challenge could not be loaded. Check your connection and retry.');
    this.name = 'DailyChallengeLoadError';
    this.status = details.status;
    this.apiCode = details.apiCode;
    this.apiMessage = details.apiMessage;
  }
}

function isDailyRound(value: unknown): value is RoundStartResponse {
  if (!value || typeof value !== 'object') return false;
  const round = value as Partial<RoundStartResponse>;
  return (
    typeof round.roundToken === 'string' &&
    typeof round.audioUrl === 'string' &&
    Array.isArray(round.stages) &&
    round.mode === 'daily'
  );
}

const isText = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
const isHttps = (v: unknown): v is string => isText(v, 2000) && /^https:\/\//.test(v);

function isDailyRevealSong(value: unknown): value is DailyRevealSong {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    isText(v.id, 100) && isText(v.title) && isText(v.artistName) && isText(v.albumName) &&
    (v.artworkUrl === '' || isHttps(v.artworkUrl)) &&
    (v.trackViewUrl === undefined || isHttps(v.trackViewUrl))
  );
}

/** Keeps only well-formed entries; anything else becomes null (shown as "not revealed"). */
export function sanitizeDailyReveals(value: unknown): Array<DailyRevealSong | null> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, DAILY_ROUND_COUNT).map((item) => (isDailyRevealSong(item) ? item : null));
}

export function isDailyChallengeInfo(value: unknown): value is DailyChallengeInfo {
  if (!value || typeof value !== 'object') return false;
  const info = value as Partial<DailyChallengeInfo>;
  return (
    typeof info.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(info.dateKey) &&
    (info.category === 'all' || info.category === 'thai' || info.category === 'international') &&
    info.totalRounds === DAILY_ROUND_COUNT &&
    Array.isArray(info.rounds) && info.rounds.length === DAILY_ROUND_COUNT &&
    info.rounds.every(isDailyRound) &&
    Number.isInteger(info.currentIndex) && info.currentIndex! >= 0 && info.currentIndex! <= DAILY_ROUND_COUNT &&
    Array.isArray(info.results) && info.results.length === DAILY_ROUND_COUNT &&
    typeof info.score === 'number' && Number.isFinite(info.score) &&
    typeof info.correctCount === 'number' && Number.isFinite(info.correctCount) &&
    typeof info.skipCount === 'number' && Number.isFinite(info.skipCount) &&
    typeof info.totalAnswerTimeMs === 'number' && Number.isFinite(info.totalAnswerTimeMs)
  );
}

export async function readDailyChallengeResponse(response: {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
}): Promise<DailyChallengeInfo> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DailyChallengeLoadError({ status: response.status });
  }
  const envelope = payload && typeof payload === 'object'
    ? payload as { code?: unknown; message?: unknown; data?: unknown }
    : null;
  const details = {
    status: response.status,
    apiCode: envelope?.code,
    apiMessage: typeof envelope?.message === 'string' ? envelope.message : undefined,
  };
  if (!response.ok || !envelope || envelope.code !== 0 || !isDailyChallengeInfo(envelope.data)) {
    throw new DailyChallengeLoadError(details);
  }
  return { ...envelope.data, reveals: sanitizeDailyReveals(envelope.data.reveals) };
}
