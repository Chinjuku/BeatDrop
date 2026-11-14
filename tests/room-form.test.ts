import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterArtistNames, normalizeClipInput } from '../shared/roomForm';

describe('normalizeClipInput', () => {
  it('rounds to 0.1 and clamps to the snippet bounds', () => {
    assert.equal(normalizeClipInput('2.34', 5), 2.3);
    assert.equal(normalizeClipInput('0', 5), 0.1);
    assert.equal(normalizeClipInput('99', 5), 15);
    assert.equal(normalizeClipInput('0.1', 5), 0.1);
    assert.equal(normalizeClipInput('15', 5), 15);
  });
  it('falls back for empty or non-numeric input', () => {
    assert.equal(normalizeClipInput('', 7), 7);
    assert.equal(normalizeClipInput('abc', 7), 7);
    assert.equal(normalizeClipInput('Infinity', 7), 7);
  });
});

describe('filterArtistNames', () => {
  const names = ['Taylor Swift', 'Bodyslam', 'Slot Machine', 'taylor Daye'];
  it('returns the first limit names for an empty query', () => {
    assert.deepEqual(filterArtistNames(names, '  ', 2), ['Taylor Swift', 'Bodyslam']);
  });
  it('matches case-insensitively, prefix matches first, de-duplicated', () => {
    assert.deepEqual(filterArtistNames([...names, 'Taylor Swift'], 'tay', 10), ['Taylor Swift', 'taylor Daye']);
    assert.deepEqual(filterArtistNames(names, 'slam', 10), ['Bodyslam']);
    assert.deepEqual(filterArtistNames(names, 'zzz', 10), []);
  });
});
