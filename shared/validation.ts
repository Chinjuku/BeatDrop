import type { CategoryType, DifficultyLevel } from './types';

const VALID_DIFFICULTIES = new Set<DifficultyLevel>(['easy', 'medium', 'hard', 'expert', 'impossible']);
const VALID_CATEGORIES = new Set<CategoryType>(['all', 'thai', 'international']);

export interface GuessDTO {
  roundToken: string;
  candidateTrackId: string;
  candidateTitle?: string;
  candidateArtist?: string;
}

export interface SkipDTO {
  roundToken: string;
  giveUp: boolean;
}

export interface LeaderboardDTO {
  playerName: string;
  score: number;
  streak: number;
  fastestSeconds: number;
  difficulty: DifficultyLevel;
  category: CategoryType;
  isDaily: boolean;
}

export interface ArtistSyncDTO {
  id?: string;
  name: string;
  category: 'thai' | 'international';
  mainGenre: string;
  avatarUrl: string;
}

export function parseGuessDTO(body: unknown): { ok: true; data: GuessDTO } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request payload' };
  }
  const b = body as Record<string, unknown>;
  const roundToken = typeof b.roundToken === 'string' ? b.roundToken.trim() : '';
  if (!roundToken || roundToken.length > 4096) {
    return { ok: false, error: 'Missing or invalid roundToken' };
  }
  const candidateTrackId =
    typeof b.candidateTrackId === 'string' || typeof b.candidateTrackId === 'number'
      ? String(b.candidateTrackId).trim().slice(0, 128)
      : '';
  const candidateTitle =
    typeof b.candidateTitle === 'string' ? b.candidateTitle.trim().slice(0, 300) : undefined;
  const candidateArtist =
    typeof b.candidateArtist === 'string' ? b.candidateArtist.trim().slice(0, 300) : undefined;

  if (!candidateTrackId && !candidateTitle) {
    return { ok: false, error: 'candidateTrackId or candidateTitle is required' };
  }
  return {
    ok: true,
    data: { roundToken, candidateTrackId, candidateTitle, candidateArtist },
  };
}

export function parseSkipDTO(body: unknown): { ok: true; data: SkipDTO } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request payload' };
  }
  const b = body as Record<string, unknown>;
  const roundToken = typeof b.roundToken === 'string' ? b.roundToken.trim() : '';
  if (!roundToken || roundToken.length > 4096) {
    return { ok: false, error: 'Missing or invalid roundToken' };
  }
  return {
    ok: true,
    data: { roundToken, giveUp: Boolean(b.giveUp) },
  };
}

export function parseLeaderboardDTO(
  body: unknown
): { ok: true; data: LeaderboardDTO } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request payload' };
  }
  const b = body as Record<string, unknown>;
  const playerName = typeof b.playerName === 'string' ? b.playerName.trim().slice(0, 24) : '';
  if (!playerName) {
    return { ok: false, error: 'playerName is required' };
  }
  const rawDiff = typeof b.difficulty === 'string' ? (b.difficulty as DifficultyLevel) : 'medium';
  const difficulty: DifficultyLevel = VALID_DIFFICULTIES.has(rawDiff) ? rawDiff : 'medium';

  const rawCat = typeof b.category === 'string' ? (b.category as CategoryType) : 'thai';
  const category: CategoryType = VALID_CATEGORIES.has(rawCat) ? rawCat : 'thai';

  const score = Number.isFinite(Number(b.score)) ? Number(b.score) : 0;
  const streak = Number.isFinite(Number(b.streak)) ? Number(b.streak) : 1;
  const fastestSeconds = Number.isFinite(Number(b.fastestSeconds)) ? Number(b.fastestSeconds) : 1;

  return {
    ok: true,
    data: {
      playerName,
      score,
      streak,
      fastestSeconds,
      difficulty,
      category,
      isDaily: Boolean(b.isDaily),
    },
  };
}

export function parseArtistSyncDTO(
  body: unknown
): { ok: true; data: ArtistSyncDTO } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request payload' };
  }
  const b = body as Record<string, unknown>;
  const rawName =
    typeof b.artistName === 'string'
      ? b.artistName
      : typeof b.name === 'string'
        ? b.name
        : typeof b.artist === 'string'
          ? b.artist
          : '';
  const name = rawName.trim().slice(0, 120);
  if (!name) {
    return { ok: false, error: 'Artist name is required' };
  }
  const id = typeof b.id === 'string' && b.id.trim() ? b.id.trim().slice(0, 120) : undefined;
  const category: 'thai' | 'international' = b.category === 'international' ? 'international' : 'thai';
  const mainGenre = typeof b.mainGenre === 'string' && b.mainGenre.trim() ? b.mainGenre.trim().slice(0, 60) : 'Pop';
  const avatarUrl =
    typeof b.avatarUrl === 'string' && b.avatarUrl.trim() ? b.avatarUrl.trim().slice(0, 1024) : '';

  return {
    ok: true,
    data: { id, name, category, mainGenre, avatarUrl },
  };
}
