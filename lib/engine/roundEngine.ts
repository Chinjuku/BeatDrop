import { Request, Response } from 'express';
import crypto from 'node:crypto';
import {
  CategoryType,
  DEFAULT_TIME_STAGES,
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  GameMode,
  RoundActionResponse,
  RoundStartResponse,
  Song,
} from '../../shared/types';
import { signRoundToken, verifyRoundToken } from '../token';
import { dbService } from '../db';
import { checkArtistStrictMatch, isJunkTrack } from '../itunes';
import { songPool, ingestArtistSongs, fetchItunesSongs } from './songPool';
import { getAllArtists, normalizeText } from './artists';

export interface ActiveRoundState {
  track: Song;
  difficulty: DifficultyLevel;
  stages: number[];
  stage: number;
  clipSeconds: number;
  mistakes: number;
  category: CategoryType;
  mode: GameMode;
  artistFilter?: string;
}

export const activeRounds = new Map<string, ActiveRoundState>();

export function parseCustomStages(raw: unknown): number[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parts = raw
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n) && n > 0 && n <= 30);
  if (parts.length >= 2) {
    const unique = Array.from(new Set(parts)).sort((a, b) => a - b);
    return unique.length >= 2 ? unique : null;
  }
  return null;
}

export function matchesYearFilter(song: Song, yearFilter?: string): boolean {
  if (!yearFilter || yearFilter === 'any') return true;
  if (yearFilter.toLowerCase() === 'classic') {
    return song.releaseYear < 2000;
  }
  if (yearFilter.endsWith('s')) {
    const decadeStart = parseInt(yearFilter.slice(0, 4), 10);
    if (!Number.isNaN(decadeStart)) {
      return song.releaseYear >= decadeStart && song.releaseYear <= decadeStart + 9;
    }
  }
  const exactYear = parseInt(yearFilter, 10);
  if (!Number.isNaN(exactYear)) {
    return song.releaseYear === exactYear;
  }
  return true;
}

function normalizeGenreComparison(g: string): string {
  const s = g.toLowerCase().trim();
  if (s.includes('hip-hop') || s.includes('rap')) return 'hip-hop';
  if (s.includes('r&b') || s.includes('soul')) return 'r&b';
  if (s.includes('indie') || s.includes('alt')) return 'indie';
  if (s.includes('edm') || s.includes('dance') || s.includes('electro') || s.includes('house')) return 'edm';
  if (s.includes('soundtrack') || s.includes('score')) return 'soundtrack';
  if (s.includes('k-pop') || s.includes('kpop')) return 'k-pop';
  if (s.includes('t-pop') || s.includes('tpop')) return 't-pop';
  if (s.includes('rock') || s.includes('metal') || s.includes('punk')) return 'rock';
  if (s.includes('pop')) return 'pop';
  return s;
}

export function matchesGenreFilter(song: Song, genreFilter?: string): boolean {
  if (!genreFilter || genreFilter === 'any') return true;
  const target = normalizeGenreComparison(genreFilter);
  const actual = normalizeGenreComparison(song.genre);
  const songCat = song.category;

  if (target === 't-pop') {
    return songCat === 'thai' && (actual === 't-pop' || actual === 'pop');
  }
  if (target === 'pop') {
    return actual === 'pop' || (songCat === 'thai' && actual === 't-pop');
  }
  return actual === target || actual.includes(target) || target.includes(actual);
}

export function matchesArtistFilter(song: Song, artistName?: string): boolean {
  if (!artistName || artistName === 'any') return true;
  return checkArtistStrictMatch(song.artistName, artistName, undefined, undefined, song.title);
}

export async function handleStartRound(req: Request, res: Response): Promise<void> {
  const category = ((req.query.category as CategoryType) || 'all') as CategoryType;
  const difficulty = ((req.query.difficulty as DifficultyLevel) || 'medium') as DifficultyLevel;
  const mode = ((req.query.mode as GameMode) || 'standard') as GameMode;
  const artistFilter = ((req.query.artist as string) || '').trim();
  const yearFilter = ((req.query.year as string) || 'any').trim();
  const genreFilter = ((req.query.genre as string) || 'any').trim();
  const excludeIds = ((req.query.exclude as string) || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;
  const customStagesParam = parseCustomStages(req.query.customStages);
  const roundStages = customStagesParam || (req.query.difficulty ? preset.stages : DEFAULT_TIME_STAGES);

  if (artistFilter && artistFilter !== 'any') {
    const existingForArtist = Array.from(songPool.values()).filter((s) =>
      matchesArtistFilter(s, artistFilter)
    );
    if (existingForArtist.length < 50) {
      const knownArtist = getAllArtists(songPool).find((a) =>
        matchesArtistFilter({ artistName: a.name } as Song, artistFilter)
      );
      const targetCat: 'thai' | 'international' = knownArtist
        ? knownArtist.category
        : (category === 'international' ? 'international' : 'thai');
      await ingestArtistSongs(
        {
          id: 'temp',
          name: artistFilter,
          category: targetCat,
          mainGenre: knownArtist?.mainGenre || (genreFilter !== 'any' ? genreFilter : 'Pop'),
          avatarUrl: knownArtist?.avatarUrl || '',
        },
        200
      );
      const afterFirstFetch = Array.from(songPool.values()).filter((s) =>
        matchesArtistFilter(s, artistFilter)
      );
      if (afterFirstFetch.length < 20) {
        const altCat = targetCat === 'thai' ? 'international' : 'thai';
        await ingestArtistSongs(
          {
            id: 'temp-alt',
            name: artistFilter,
            category: altCat,
            mainGenre: knownArtist?.mainGenre || 'Pop',
            avatarUrl: '',
          },
          100
        );
      }
    }
  }

  let pool = Array.from(songPool.values()).filter(
    (s) => !isJunkTrack(s.title, s.albumName, s.artistName)
  );

  const libraryArtists = getAllArtists(songPool);
  pool = pool.filter((s) =>
    libraryArtists.some((a) =>
      checkArtistStrictMatch(s.artistName, a.name, undefined, undefined, s.title)
    )
  );

  if (!artistFilter || artistFilter === 'any') {
    if (category === 'thai' || category === 'international') {
      pool = pool.filter((s) => s.category === category);
    }
  }

  let candidates: Song[] = [];
  if (artistFilter && artistFilter !== 'any') {
    candidates = pool.filter((s) => matchesArtistFilter(s, artistFilter));
    if (candidates.length === 0) {
      const dbMatches = dbService
        .searchSongs(artistFilter, { artist: artistFilter, limit: 200 })
        .filter((s) => matchesArtistFilter(s, artistFilter) && !isJunkTrack(s.title, s.albumName, s.artistName));
      for (const m of dbMatches) {
        songPool.set(m.id, m);
      }
      candidates = dbMatches;
    }
  } else {
    candidates = pool;
  }

  if (mode !== 'artist') {
    if (yearFilter && yearFilter !== 'any') {
      const yearMatches = candidates.filter((s) => matchesYearFilter(s, yearFilter));
      if (yearMatches.length > 0) {
        candidates = yearMatches;
      }
    }
    if (genreFilter && genreFilter !== 'any') {
      const genreMatches = candidates.filter((s) => matchesGenreFilter(s, genreFilter));
      if (genreMatches.length > 0) {
        candidates = genreMatches;
      }
    }
  }

  if (candidates.length === 0) {
    if (artistFilter && artistFilter !== 'any') {
      candidates = pool.filter((s) => matchesArtistFilter(s, artistFilter));
    } else if (category === 'thai' || category === 'international') {
      candidates = pool.filter((s) => s.category === category);
    } else {
      candidates = pool;
    }
  }

  if (candidates.length === 0) {
    res.status(404).json({
      code: -1,
      message: 'ไม่พบเพลงที่ตรงกับตัวกรองที่เลือก กรุณาลองเลือกแนวเพลงหรือปีอื่น',
    });
    return;
  }

  const totalMatchingPoolSize = candidates.length;

  if (candidates.length > 6) {
    const sorted = [...candidates].sort(
      (a, b) => (b.popularityScore || 50) - (a.popularityScore || 50)
    );
    if (difficulty === 'easy') {
      candidates = sorted.slice(0, Math.max(5, Math.ceil(sorted.length * 0.65)));
    } else if (difficulty === 'hard') {
      candidates = sorted.slice(Math.floor(sorted.length * 0.25));
    }
  }

  const nonExcluded = candidates.filter((s) => !excludeIds.includes(s.id));
  if (nonExcluded.length > 0) {
    candidates = nonExcluded;
  }

  const selectedTrack = candidates[Math.floor(Math.random() * candidates.length)];
  const roundState: ActiveRoundState = {
    track: selectedTrack,
    difficulty,
    stages: roundStages,
    stage: 0,
    clipSeconds: roundStages[0],
    mistakes: 0,
    category,
    mode,
    artistFilter: artistFilter && artistFilter !== 'any' ? artistFilter : undefined,
  };
  const roundToken = signRoundToken(roundState);
  const roundKey = `rk_${crypto.randomUUID()}`;

  let choices: Array<{ id: string; title: string; artistName: string; artworkUrl?: string }> | undefined;
  if (mode === 'guesser') {
    const distractorPool = Array.from(songPool.values()).filter(
      (s) =>
        s.id !== selectedTrack.id &&
        normalizeText(s.title) !== normalizeText(selectedTrack.title) &&
        s.category === selectedTrack.category &&
        !isJunkTrack(s.title, s.albumName, s.artistName)
    );
    const sameArtistOrGenre = distractorPool.filter(
      (s) =>
        normalizeText(s.artistName) === normalizeText(selectedTrack.artistName) ||
        s.genre.toLowerCase() === selectedTrack.genre.toLowerCase()
    );
    const poolToUse = sameArtistOrGenre.length >= 6 ? sameArtistOrGenre : distractorPool;
    const shuffledDistractors = [...poolToUse].sort(() => Math.random() - 0.5);
    const pickedDistractors: Song[] = [];
    const seenTitles = new Set<string>([normalizeText(selectedTrack.title)]);

    for (const d of shuffledDistractors) {
      const tNorm = normalizeText(d.title);
      if (!seenTitles.has(tNorm)) {
        seenTitles.add(tNorm);
        pickedDistractors.push(d);
      }
      if (pickedDistractors.length >= 3) break;
    }

    const rawOptions = [selectedTrack, ...pickedDistractors].map((s) => ({
      id: s.id,
      title: s.title,
      artistName: s.artistName,
      artworkUrl: s.artworkUrl,
    }));
    choices = rawOptions.sort(() => Math.random() - 0.5);
  }

  activeRounds.set(roundToken, roundState);

  const responsePayload: RoundStartResponse = {
    roundToken,
    roundKey,
    audioUrl: selectedTrack.previewUrl,
    difficulty,
    stages: roundStages,
    stage: 0,
    clipSeconds: roundStages[0],
    category,
    mode,
    artistFilter: artistFilter && artistFilter !== 'any' ? artistFilter : undefined,
    yearFilter,
    genreFilter,
    choices,
    poolSize: totalMatchingPoolSize,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };

  res.json({
    code: 0,
    message: 'ok',
    data: responsePayload,
  });
}

export async function handleAutocomplete(req: Request, res: Response): Promise<void> {
  const q = ((req.query.q as string) || '').trim();
  const category = ((req.query.category as CategoryType) || 'all') as CategoryType;
  const artistFilter = ((req.query.artist as string) || '').trim();
  const limit = Math.min(60, Math.max(1, parseInt((req.query.limit as string) || '10', 10)));

  if (artistFilter && artistFilter !== 'any') {
    const existing = Array.from(songPool.values()).filter((s) => matchesArtistFilter(s, artistFilter));
    if (existing.length < 30) {
      const knownArtist = getAllArtists(songPool).find((a) => matchesArtistFilter({ artistName: a.name } as Song, artistFilter));
      const targetCat = knownArtist?.category || (category === 'international' ? 'international' : 'thai');
      await ingestArtistSongs(
        {
          id: 'temp-auto',
          name: artistFilter,
          category: targetCat,
          mainGenre: knownArtist?.mainGenre || 'Pop',
          avatarUrl: knownArtist?.avatarUrl || '',
        },
        100
      );
    }
  }

  let pool = Array.from(songPool.values());

  if (artistFilter && artistFilter !== 'any') {
    pool = pool.filter((s) => matchesArtistFilter(s, artistFilter));
  } else if (category === 'thai' || category === 'international') {
    pool = pool.filter((s) => s.category === category);
  }

  let matches: Song[] = [];
  if (!q) {
    matches = pool;
  } else {
    const qNorm = normalizeText(q);
    const qLower = q.toLowerCase();
    matches = pool.filter(
      (s) =>
        s.title.toLowerCase().includes(qLower) ||
        s.artistName.toLowerCase().includes(qLower) ||
        normalizeText(s.title).includes(qNorm) ||
        normalizeText(s.artistName).includes(qNorm)
    );

    if (matches.length < limit) {
      const dbMatches = dbService.searchSongs(q, {
        category,
        artist: artistFilter && artistFilter !== 'any' ? artistFilter : undefined,
        limit,
      });
      for (const ds of dbMatches) {
        songPool.set(ds.id, ds);
        if (!matches.some((m) => m.id === ds.id)) {
          matches.push(ds);
        }
      }
    }

    if (artistFilter && artistFilter !== 'any' && matches.length < 4 && q.length >= 1) {
      const knownArtist = getAllArtists(songPool).find((a) => matchesArtistFilter({ artistName: a.name } as Song, artistFilter));
      const country = (knownArtist?.category || category) === 'international' ? 'US' : 'TH';
      const targetCat = (knownArtist?.category || category) === 'international' ? 'international' : 'thai';
      const liveTracks = await fetchItunesSongs(`${artistFilter} ${q}`, country, targetCat, 20);
      const matchingLive = liveTracks.filter((t) => matchesArtistFilter(t, artistFilter));
      for (const lt of matchingLive) {
        songPool.set(lt.id, lt);
        if (!matches.some((m) => m.id === lt.id)) {
          matches.push(lt);
        }
      }
      dbService.saveSongs(matchingLive);
    } else if ((!artistFilter || artistFilter === 'any') && matches.length < 4 && q.length >= 2) {
      const country = category === 'international' ? 'US' : 'TH';
      const targetCat = category === 'international' ? 'international' : 'thai';
      const liveTracks = await fetchItunesSongs(q, country, targetCat, 8);
      const libraryArtists = getAllArtists(songPool);
      const validLive = liveTracks.filter((t) =>
        libraryArtists.some((a) => checkArtistStrictMatch(t.artistName, a.name, undefined, undefined, t.title))
      );
      for (const lt of validLive) {
        songPool.set(lt.id, lt);
        if (!matches.some((m) => m.id === lt.id)) {
          matches.push(lt);
        }
      }
      if (validLive.length > 0) {
        dbService.saveSongs(validLive);
      }
    }
  }

  const seenKey = new Set<string>();
  const uniqueMatches: Song[] = [];
  for (const song of matches) {
    const dedupKey = `${normalizeText(song.title)}::${normalizeText(song.artistName)}`;
    if (!seenKey.has(dedupKey)) {
      seenKey.add(dedupKey);
      uniqueMatches.push(song);
    }
    if (uniqueMatches.length >= limit) break;
  }

  res.json({
    code: 0,
    message: 'ok',
    data: uniqueMatches,
  });
}

export function handleGuess(req: Request, res: Response): void {
  const { roundToken, candidateTrackId, candidateTitle, candidateArtist } = req.body || {};
  const active = activeRounds.get(roundToken) || verifyRoundToken(roundToken);

  if (!active) {
    res.status(400).json({ code: -1, message: 'Invalid or expired round token' });
    return;
  }

  const candidateSong = songPool.get(String(candidateTrackId));
  const guessedTitle = candidateSong?.title || candidateTitle || '';
  const guessedArtist = candidateSong?.artistName || candidateArtist || '';

  const exactIdMatch = String(active.track.id) === String(candidateTrackId);
  const titleMatch =
    Boolean(guessedTitle) &&
    normalizeText(active.track.title) === normalizeText(guessedTitle) &&
    (!guessedArtist ||
      normalizeText(active.track.artistName).includes(normalizeText(guessedArtist)) ||
      normalizeText(guessedArtist).includes(normalizeText(active.track.artistName)));

  if (exactIdMatch || titleMatch) {
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: 'correct',
      stage: active.stage,
      clipSeconds: active.clipSeconds,
      mistakes: active.mistakes,
      reveal: active.track,
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  if (active.mode === 'guesser') {
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: 'failed',
      stage: active.stage,
      clipSeconds: active.clipSeconds,
      mistakes: active.mistakes + 1,
      reveal: active.track,
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  active.mistakes += 1;
  active.stage += 1;

  if (active.stage >= active.stages.length) {
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: 'failed',
      stage: active.stages.length - 1,
      clipSeconds: active.stages[active.stages.length - 1],
      mistakes: active.mistakes,
      reveal: active.track,
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  active.clipSeconds = active.stages[active.stage];
  const nextToken = signRoundToken(active);
  activeRounds.delete(roundToken);
  activeRounds.set(nextToken, active);

  const payload: RoundActionResponse = {
    outcome: 'active',
    roundToken: nextToken,
    stage: active.stage,
    clipSeconds: active.clipSeconds,
    mistakes: active.mistakes,
  };
  res.json({ code: 0, message: 'ok', data: payload });
}

export function handleSkip(req: Request, res: Response): void {
  const { roundToken, giveUp } = req.body || {};
  const active = activeRounds.get(roundToken) || verifyRoundToken(roundToken);

  if (!active) {
    res.status(400).json({ code: -1, message: 'Invalid or expired round token' });
    return;
  }

  active.stage += 1;

  if (giveUp || active.stage >= active.stages.length) {
    activeRounds.delete(roundToken);
    const payload: RoundActionResponse = {
      outcome: 'failed',
      stage: Math.min(active.stage, active.stages.length - 1),
      clipSeconds: active.stages[active.stages.length - 1],
      mistakes: active.mistakes,
      reveal: active.track,
    };
    res.json({ code: 0, message: 'ok', data: payload });
    return;
  }

  active.clipSeconds = active.stages[active.stage];
  const nextToken = signRoundToken(active);
  activeRounds.delete(roundToken);
  activeRounds.set(nextToken, active);

  const payload: RoundActionResponse = {
    outcome: 'active',
    roundToken: nextToken,
    stage: active.stage,
    clipSeconds: active.clipSeconds,
    mistakes: active.mistakes,
  };
  res.json({ code: 0, message: 'ok', data: payload });
}

