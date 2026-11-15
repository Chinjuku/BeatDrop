/**
 * Restoring saved round settings (clip-range preset, stages, difficulty) on a fresh page load.
 * Regression: picking Medium + Songspot and reloading showed the Songspot chip but played
 * Standard stages on Easy, because the first round started from the pre-hydration defaults
 * and the non-Daily difficulty was never saved.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_PREFERENCE_KEYS,
  applyStoredConfigPreferences,
  difficultyPreferenceKey,
} from '../lib/configPreferences';
import { DEFAULT_TIME_STAGES, TIME_RANGE_PRESETS, type GameConfig } from '../shared/types';

const defaults: GameConfig = {
  category: 'thai',
  difficulty: 'easy',
  mode: 'standard',
  yearFilter: 'any',
  genreFilter: 'any',
  timeRangePreset: 'standard',
  customStages: DEFAULT_TIME_STAGES,
};

const reader = (entries: Record<string, string>) => (key: string) => entries[key] ?? null;

describe('applyStoredConfigPreferences', () => {
  it('restores Songspot stages together with the Songspot chip', () => {
    const cfg = applyStoredConfigPreferences(
      defaults,
      reader({ [CONFIG_PREFERENCE_KEYS.timePreset]: 'songspot' })
    );
    assert.equal(cfg.timeRangePreset, 'songspot');
    assert.deepEqual(cfg.customStages, TIME_RANGE_PRESETS.songspot.stages);
  });

  it('restores the difficulty chosen outside Daily for Play and Guesser', () => {
    const read = reader({ [CONFIG_PREFERENCE_KEYS.difficulty]: 'medium' });
    assert.equal(applyStoredConfigPreferences(defaults, read).difficulty, 'medium');
    assert.equal(applyStoredConfigPreferences({ ...defaults, mode: 'guesser' }, read).difficulty, 'medium');
  });

  it('keeps Daily on its own saved difficulty', () => {
    const read = reader({
      [CONFIG_PREFERENCE_KEYS.difficulty]: 'medium',
      [CONFIG_PREFERENCE_KEYS.dailyDifficulty]: 'hard',
    });
    assert.equal(applyStoredConfigPreferences({ ...defaults, mode: 'daily' }, read).difficulty, 'hard');
    assert.equal(applyStoredConfigPreferences(defaults, read).difficulty, 'medium');
  });

  it('falls back to the Daily difficulty when no general one was saved yet', () => {
    const read = reader({ [CONFIG_PREFERENCE_KEYS.dailyDifficulty]: 'expert' });
    assert.equal(applyStoredConfigPreferences(defaults, read).difficulty, 'expert');
  });

  it('reads a saved custom list whose stages equal Standard as Standard, never Custom', () => {
    const cfg = applyStoredConfigPreferences(
      defaults,
      reader({
        [CONFIG_PREFERENCE_KEYS.timePreset]: 'custom',
        [CONFIG_PREFERENCE_KEYS.customStages]: JSON.stringify(TIME_RANGE_PRESETS.standard.stages),
      })
    );
    assert.equal(cfg.timeRangePreset, 'standard');
  });

  it('keeps a genuine custom list', () => {
    const cfg = applyStoredConfigPreferences(
      defaults,
      reader({
        [CONFIG_PREFERENCE_KEYS.timePreset]: 'custom',
        [CONFIG_PREFERENCE_KEYS.customStages]: '[1,3,9]',
      })
    );
    assert.equal(cfg.timeRangePreset, 'custom');
    assert.deepEqual(cfg.customStages, [1, 3, 9]);
  });

  it('ignores tampered or out-of-range values', () => {
    const cfg = applyStoredConfigPreferences(
      defaults,
      reader({
        [CONFIG_PREFERENCE_KEYS.timePreset]: 'turbo',
        [CONFIG_PREFERENCE_KEYS.customStages]: '[0,99]',
        [CONFIG_PREFERENCE_KEYS.difficulty]: 'godlike',
        [CONFIG_PREFERENCE_KEYS.dailyCategory]: 'mars',
      })
    );
    assert.deepEqual(cfg, defaults);
  });

  it('survives malformed JSON', () => {
    const cfg = applyStoredConfigPreferences(
      defaults,
      reader({ [CONFIG_PREFERENCE_KEYS.timePreset]: 'custom', [CONFIG_PREFERENCE_KEYS.customStages]: '{nope' })
    );
    assert.equal(cfg.timeRangePreset, 'standard');
    assert.deepEqual(cfg.customStages, DEFAULT_TIME_STAGES);
  });

  it('routes difficulty saves by mode', () => {
    assert.equal(difficultyPreferenceKey('daily'), CONFIG_PREFERENCE_KEYS.dailyDifficulty);
    assert.equal(difficultyPreferenceKey('guesser'), CONFIG_PREFERENCE_KEYS.difficulty);
    assert.equal(difficultyPreferenceKey('standard'), CONFIG_PREFERENCE_KEYS.difficulty);
  });
});
