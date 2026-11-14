/**
 * Daily archive practice history, on this device only.
 *
 * Stored through the consent-gated preference storage: nothing is written unless the player
 * allowed preference cookies. It is a convenience ("you practised this day"), never a source
 * of truth: it is not sent anywhere and never affects scores or leaderboards. Values read back
 * are validated because the player (or another script) can edit localStorage.
 */
import { getPreference, setPreference } from './preferenceStorage';
import type { CategoryType, DifficultyLevel } from '../shared/types';

const KEY = 'songspot:daily-archive:v1';
const MAX_ENTRIES = 400;

/** One character per stage: c = correct, s = skipped, w = wrong, - = not reached. */
export interface ArchivePracticeResult {
  score: number;
  grid: string;
  at: number;
}

type Store = Record<string, ArchivePracticeResult>;

export const practiceKey = (dateKey: string, category: CategoryType, difficulty: DifficultyLevel) =>
  `${dateKey}|${category}|${difficulty}`;

function isResult(value: unknown): value is ArchivePracticeResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.score === 'number' && Number.isFinite(v.score) && v.score >= 0 && v.score <= 5000 &&
    typeof v.grid === 'string' && /^[csw-]{1,40}$/.test(v.grid) &&
    typeof v.at === 'number' && Number.isFinite(v.at)
  );
}

export function readPracticeHistory(): Store {
  try {
    const raw = getPreference(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const clean: Store = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}\|(all|thai|international)\|(easy|medium|hard|expert|impossible)$/.test(key) && isResult(value)) {
        clean[key] = value;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

/** Keeps the best score per day; trims the oldest entries beyond MAX_ENTRIES. */
export function savePracticeResult(key: string, result: ArchivePracticeResult): Store {
  const store = readPracticeHistory();
  const previous = store[key];
  if (!previous || result.score >= previous.score) store[key] = result;
  const entries = Object.entries(store).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES);
  const next = Object.fromEntries(entries);
  try {
    setPreference(KEY, JSON.stringify(next));
  } catch {}
  return next;
}
