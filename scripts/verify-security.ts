import assert from 'node:assert/strict';
import { signRoundToken, verifyRoundToken } from '../shared/roundToken';
import {
  mapGenreTag,
  resolveArtistMainGenre,
  isKnownThaiArtistName,
} from '../lib/itunes';
import {
  parseGuessDTO,
  parseSkipDTO,
  parseLeaderboardDTO,
  parseArtistSyncDTO,
} from '../shared/validation';
import type { ActiveRoundState } from '../lib/engine/roundEngine';

// 1. Verify AES-256-GCM roundToken encryption & tamper rejection
const mockState: ActiveRoundState = {
  track: {
    id: 'song-999',
    title: 'Secret Song Title',
    artistName: 'Secret Artist',
    albumName: 'Secret Album',
    releaseYear: 2025,
    genre: 'T-Pop',
    category: 'thai',
    previewUrl: 'https://example.com/audio.m4a',
    artworkUrl: 'https://example.com/art.jpg',
  },
  difficulty: 'medium',
  stages: [0.5, 2, 6, 8, 15],
  stage: 0,
  clipSeconds: 0.5,
  mistakes: 0,
  category: 'thai',
  mode: 'standard',
  startedAt: Date.now(),
};

const token = signRoundToken(mockState);
assert.ok(token.startsWith('bd2.'), 'Token must use bd2 AES-256-GCM prefix');

// Ensure base64-decoding any segment of the token does NOT leak plaintext song title or artist
for (const part of token.split('.').slice(1)) {
  const decoded = Buffer.from(part, 'base64url').toString('utf8');
  assert.ok(!decoded.includes('Secret Song Title'), 'Ciphertext must not leak track title');
  assert.ok(!decoded.includes('Secret Artist'), 'Ciphertext must not leak artist name');
}

const verified = verifyRoundToken<ActiveRoundState>(token);
assert.ok(verified, 'Valid token must decrypt and verify');
assert.equal(verified.track.id, 'song-999');
assert.equal(verified.track.title, 'Secret Song Title');

// Tampered ciphertext must return null
const parts = token.split('.');
parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith('A') ? 'B' : 'A');
assert.equal(verifyRoundToken(parts.join('.')), null, 'Tampered token must fail GCM auth tag check');

// 2. Verify zero-dependency DTO validators
assert.equal(parseGuessDTO(null).ok, false);
assert.equal(parseGuessDTO({ roundToken: 'bd2.x.y.z' }).ok, false);
const validGuess = parseGuessDTO({ roundToken: 'bd2.x.y.z', candidateTrackId: 12345 });
assert.equal(validGuess.ok, true);
if (validGuess.ok) {
  assert.equal(validGuess.data.candidateTrackId, '12345');
}

assert.equal(parseSkipDTO({}).ok, false);
assert.equal(parseSkipDTO({ roundToken: 'bd2.x.y.z', giveUp: 1 }).ok, true);

assert.equal(parseLeaderboardDTO({ playerName: '   ' }).ok, false);
const validLb = parseLeaderboardDTO({
  playerName: '  Chinjuku  ',
  score: '450',
  difficulty: 'invalid-diff',
  category: 'thai',
});
assert.equal(validLb.ok, true);
if (validLb.ok) {
  assert.equal(validLb.data.playerName, 'Chinjuku');
  assert.equal(validLb.data.difficulty, 'medium');
  assert.equal(validLb.data.score, 450);
}

assert.equal(parseArtistSyncDTO({}).ok, false);
const validSync = parseArtistSyncDTO({ artistName: ' LISA ', category: 'international' });
assert.equal(validSync.ok, true);
if (validSync.ok) {
  assert.equal(validSync.data.name, 'LISA');
  assert.equal(validSync.data.category, 'international');
}

// 3. Verify iTunes genre & category mapping
assert.equal(isKnownThaiArtistName('Bodyslam'), true);
assert.equal(isKnownThaiArtistName('Katy Perry'), false);
assert.equal(mapGenreTag('Pop', 'international'), 'Pop');
assert.equal(mapGenreTag('Pop', 'thai'), 'T-Pop');
assert.equal(mapGenreTag('Rock', 'thai'), 'Rock');
assert.equal(mapGenreTag('K-Pop', 'international'), 'K-Pop');
assert.equal(
  resolveArtistMainGenre(
    [
      { id: '1', title: 'A', artistName: 'Bodyslam', albumName: 'X', releaseYear: 2020, genre: 'Rock', category: 'thai', previewUrl: '', artworkUrl: '' },
      { id: '2', title: 'B', artistName: 'Bodyslam', albumName: 'X', releaseYear: 2020, genre: 'T-Pop', category: 'thai', previewUrl: '', artworkUrl: '' },
      { id: '3', title: 'C', artistName: 'Bodyslam', albumName: 'X', releaseYear: 2020, genre: 'Rock', category: 'thai', previewUrl: '', artworkUrl: '' },
    ],
    'thai',
    'Rock'
  ),
  'Rock'
);

console.log('All security & DTO validation assertions passed.');

