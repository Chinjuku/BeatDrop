/**
 * Saved round settings (clip-range preset, stages, difficulty, Daily category) and how a
 * fresh page load turns them back into a GameConfig. Pure: the caller passes the reader,
 * so GameContext can use the consent-gated `getPreference` and tests a plain map.
 *
 * Storage values are untrusted, so every one is validated before use.
 */
import {
  DEFAULT_TIME_STAGES,
  MAX_SNIPPET_DURATION,
  MIN_SNIPPET_DURATION,
  TIME_RANGE_PRESETS,
  resolveTimeRangePreset,
  type CategoryType,
  type DifficultyLevel,
  type GameConfig,
  type GameMode,
  type TimeRangePresetId,
} from '../shared/types';

export const CONFIG_PREFERENCE_KEYS = {
  timePreset: 'songspot:time-range-preset',
  customStages: 'songspot:custom-stages',
  /** Difficulty for Play / Guesser (every non-Daily mode). */
  difficulty: 'songspot:difficulty',
  dailyDifficulty: 'songspot:daily-difficulty',
  dailyCategory: 'songspot:daily-category',
} as const;

export type PreferenceReader = (key: string) => string | null;

const TIME_PRESET_IDS = new Set<TimeRangePresetId>(['relaxed', 'standard', 'songspot', 'custom']);
const DIFFICULTIES = new Set<DifficultyLevel>(['easy', 'medium', 'hard', 'expert', 'impossible']);
const CATEGORIES = new Set<CategoryType>(['thai', 'international', 'all']);

function isDifficulty(value: string | null): value is DifficultyLevel {
  return value !== null && DIFFICULTIES.has(value as DifficultyLevel);
}

function readCustomStages(read: PreferenceReader): number[] | null {
  const raw = read(CONFIG_PREFERENCE_KEYS.customStages);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length >= 2 &&
      parsed.every(
        (n) => typeof n === 'number' && n >= MIN_SNIPPET_DURATION && n <= MAX_SNIPPET_DURATION
      )
    ) {
      return parsed as number[];
    }
  } catch {
    /* malformed JSON */
  }
  return null;
}

/** Storage key the difficulty for `mode` is saved under (Daily keeps its own). */
export function difficultyPreferenceKey(mode: GameMode): string {
  return mode === 'daily' ? CONFIG_PREFERENCE_KEYS.dailyDifficulty : CONFIG_PREFERENCE_KEYS.difficulty;
}

/**
 * `cfg` with the saved settings applied. `cfg.mode` decides which difficulty is read:
 * Daily uses its own key; other modes use the general key and, until one was saved,
 * the Daily one (the behaviour before the general key existed).
 */
export function applyStoredConfigPreferences(cfg: GameConfig, read: PreferenceReader): GameConfig {
  const next: GameConfig = { ...cfg };

  const preset = read(CONFIG_PREFERENCE_KEYS.timePreset) as TimeRangePresetId | null;
  if (preset && TIME_PRESET_IDS.has(preset)) {
    const stages =
      preset === 'custom'
        ? readCustomStages(read) ?? DEFAULT_TIME_STAGES
        : TIME_RANGE_PRESETS[preset].stages;
    // A saved 'custom' whose stages equal a named preset is that preset.
    next.timeRangePreset = preset === 'custom' ? resolveTimeRangePreset(stages) : preset;
    next.customStages = stages;
  }

  const dailyDifficulty = read(CONFIG_PREFERENCE_KEYS.dailyDifficulty);
  const generalDifficulty = read(CONFIG_PREFERENCE_KEYS.difficulty);
  if (cfg.mode === 'daily') {
    if (isDifficulty(dailyDifficulty)) next.difficulty = dailyDifficulty;
  } else if (isDifficulty(generalDifficulty)) {
    next.difficulty = generalDifficulty;
  } else if (isDifficulty(dailyDifficulty)) {
    next.difficulty = dailyDifficulty;
  }

  const category = read(CONFIG_PREFERENCE_KEYS.dailyCategory) as CategoryType | null;
  if (category && CATEGORIES.has(category)) next.category = category;

  return next;
}
