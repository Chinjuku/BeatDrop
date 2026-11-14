import type { Artist, ArtistSyncJob, CategoryType, DailyLeaderboardEntry, DailyRoundProgress, LeaderboardEntry, Song, TrackArtistCredit } from './types';

export interface SupabaseSongRow {
  id: string;
  title: string;
  artist_id: string | null;
  artist_name: string;
  album_name: string | null;
  release_year: number | null;
  release_date: string | null;
  genre: string | null;
  category: 'thai' | 'international';
  preview_url: string;
  artwork_url: string | null;
  track_view_url: string | null;
  popularity_score: number | null;
  updated_at?: string;
}

export interface SupabaseArtistRow {
  id: string;
  name: string;
  category: 'thai' | 'international';
  main_genre: string | null;
  avatar_url: string | null;
  is_custom: boolean;
  track_count: number | null;
  updated_at?: string;
}

export type GuesserRoundClaim =
  | { kind: 'claimed'; result: 'correct' | 'wrong' | 'skipped' }
  | { kind: 'already-finalized'; result: 'correct' | 'wrong' | 'skipped' }
  | { kind: 'unavailable' };

export function isDbLocal(): boolean {
  return process.env.DB_LOCAL === 'true';
}

export function isSupabaseConfigured(): boolean {
  if (isDbLocal()) {
    return false;
  }
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  );
}

function getSupabaseHeaders(prefer?: string): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

function getRestUrl(path: string): string {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  return `${base}/rest/v1/${path}`;
}

const SUPABASE_TIMEOUT_MS = 4500;
let remoteJobsTableAvailable: boolean | null = null;
let remoteTrackArtistsTableAvailable: boolean | null = null;
let remoteGuesserResultsTableAvailable: boolean | null = null;
let remoteDailyProgressTableAvailable: boolean | null = null;
let remoteDailyLeaderboardTableAvailable: boolean | null = null;
const memorySyncJobs = new Map<string, ArtistSyncJob>();
const memoryGuesserResults = new Map<string, 'correct' | 'wrong' | 'skipped'>();
const memoryDailyProgress = new Map<string, DailyRoundProgress>();
const memoryDailyLeaderboard = new Map<string, DailyLeaderboardEntry>();

function dailyProgressKey(
  playerId: string,
  dateKey: string,
  category: CategoryType,
  roundIndex: number
): string {
  return `${playerId}::${dateKey}::${category}::${roundIndex}`;
}

function dailyLeaderboardKey(
  playerId: string,
  dateKey: string,
  category: CategoryType
): string {
  return `${playerId}::${dateKey}::${category}`;
}

function isMissingOrDeniedTableStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 404;
}

async function supabaseFetch(url: string, init?: RequestInit, timeoutMs = SUPABASE_TIMEOUT_MS): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init?.signal || AbortSignal.timeout(timeoutMs),
  });
}

export function songToRow(s: Song): SupabaseSongRow {
  return {
    id: String(s.id),
    title: s.title,
    artist_id: s.artistId ?? null,
    artist_name: s.artistName,
    album_name: s.albumName || 'Single',
    release_year: s.releaseYear || 2020,
    release_date: s.releaseDate ? s.releaseDate.slice(0, 10) : null,
    genre: s.genre || 'Pop',
    category: s.category === 'international' ? 'international' : 'thai',
    preview_url: s.previewUrl,
    artwork_url: s.artworkUrl || null,
    track_view_url: s.trackViewUrl ?? null,
    popularity_score: s.popularityScore ?? 50,
    updated_at: new Date().toISOString(),
  };
}

export function rowToSong(r: SupabaseSongRow): Song {
  return {
    id: r.id,
    title: r.title,
    artistId: r.artist_id || undefined,
    artistName: r.artist_name,
    albumName: r.album_name || 'Single',
    releaseYear: r.release_year || 2020,
    releaseDate: r.release_date || undefined,
    genre: r.genre || 'Pop',
    category: r.category,
    previewUrl: r.preview_url,
    artworkUrl: r.artwork_url || '',
    trackViewUrl: r.track_view_url || undefined,
    popularityScore: r.popularity_score ?? 50,
  };
}

export const supabaseAdmin = {
  async getGuesserRoundResult(roundId: string): Promise<'correct' | 'wrong' | 'skipped' | null> {
    const mem = memoryGuesserResults.get(roundId) ?? null;
    if (!isSupabaseConfigured() || remoteGuesserResultsTableAvailable === false) {
      return mem;
    }
    try {
      const response = await supabaseFetch(getRestUrl(
        `guesser_round_results?round_id=eq.${encodeURIComponent(roundId)}&select=result&limit=1`
      ), { headers: getSupabaseHeaders() });
      if (!response.ok) {
        if (isMissingOrDeniedTableStatus(response.status)) {
          remoteGuesserResultsTableAvailable = false;
        }
        return mem;
      }
      remoteGuesserResultsTableAvailable = true;
      const rows = await response.json() as Array<{ result?: unknown }>;
      const result = rows[0]?.result;
      if (result === 'correct' || result === 'wrong' || result === 'skipped') {
        memoryGuesserResults.set(roundId, result);
        return result;
      }
      return mem;
    } catch {
      return mem;
    }
  },

  async claimGuesserRoundResult(roundId: string, result: 'correct' | 'wrong' | 'skipped'): Promise<GuesserRoundClaim> {
    const claimInMemory = (): GuesserRoundClaim => {
      const existing = memoryGuesserResults.get(roundId);
      if (existing) {
        return { kind: 'already-finalized', result: existing };
      }
      memoryGuesserResults.set(roundId, result);
      return { kind: 'claimed', result };
    };

    if (!isSupabaseConfigured()) return { kind: 'unavailable' };
    if (remoteGuesserResultsTableAvailable === false) {
      return claimInMemory();
    }
    try {
      const response = await supabaseFetch(getRestUrl('guesser_round_results?on_conflict=round_id'), {
        method: 'POST',
        headers: getSupabaseHeaders('resolution=ignore-duplicates,return=representation'),
        body: JSON.stringify({
          round_id: roundId,
          result,
          created_at: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        if (isMissingOrDeniedTableStatus(response.status)) {
          remoteGuesserResultsTableAvailable = false;
          return claimInMemory();
        }
        console.error('[Song Guesser] Could not persist round result', { status: response.status });
      } else {
        remoteGuesserResultsTableAvailable = true;
        const rows = await response.json() as unknown[];
        if (rows.length === 1) {
          memoryGuesserResults.set(roundId, result);
          return { kind: 'claimed', result };
        }
      }

      // A retried or concurrent request must receive the already persisted
      // terminal result. That keeps the UI recoverable without awarding twice.
      const existingResponse = await supabaseFetch(getRestUrl(
        `guesser_round_results?round_id=eq.${encodeURIComponent(roundId)}&select=result&limit=1`
      ), { headers: getSupabaseHeaders() });
      if (!existingResponse.ok) {
        if (isMissingOrDeniedTableStatus(existingResponse.status)) {
          remoteGuesserResultsTableAvailable = false;
        }
        return claimInMemory();
      }
      const existingRows = await existingResponse.json() as Array<{ result?: unknown }>;
      const existingResult = existingRows[0]?.result;
      if (existingResult === 'correct' || existingResult === 'wrong' || existingResult === 'skipped') {
        memoryGuesserResults.set(roundId, existingResult);
        return { kind: 'already-finalized', result: existingResult };
      }
      return claimInMemory();
    } catch {
      return claimInMemory();
    }
  },

  async getOrCreateDailyRoundProgress(progress: DailyRoundProgress): Promise<DailyRoundProgress | null> {
    const key = dailyProgressKey(
      progress.playerId,
      progress.dateKey,
      progress.category,
      progress.roundIndex
    );
    const getOrCreateInMemory = (): DailyRoundProgress => {
      const existing = memoryDailyProgress.get(key);
      if (existing) {
        if (existing.status === 'pending' && existing.trackId !== progress.trackId) {
          const synced: DailyRoundProgress = { ...existing, trackId: progress.trackId };
          memoryDailyProgress.set(key, synced);
          return synced;
        }
        return existing;
      }
      const created: DailyRoundProgress = {
        playerId: progress.playerId,
        dateKey: progress.dateKey,
        category: progress.category,
        roundIndex: progress.roundIndex,
        trackId: progress.trackId,
        startedAt: progress.startedAt,
        status: 'pending',
        score: 0,
        speedBonus: 0,
        answerTimeMs: 0,
      };
      memoryDailyProgress.set(key, created);
      return created;
    };

    if (!isSupabaseConfigured()) return null;
    if (remoteDailyProgressTableAvailable === false) {
      return getOrCreateInMemory();
    }
    try {
      const post = await supabaseFetch(getRestUrl('daily_round_progress?on_conflict=player_id,date_key,category,round_index'), {
        method: 'POST',
        headers: getSupabaseHeaders('resolution=ignore-duplicates,return=minimal'),
        body: JSON.stringify({
          player_id: progress.playerId,
          date_key: progress.dateKey,
          category: progress.category,
          round_index: progress.roundIndex,
          track_id: progress.trackId,
          started_at: progress.startedAt,
        }),
      });
      if (!post.ok) {
        if (isMissingOrDeniedTableStatus(post.status)) {
          remoteDailyProgressTableAvailable = false;
        }
        return getOrCreateInMemory();
      }
      remoteDailyProgressTableAvailable = true;
      const rows = await this.getDailyRoundProgress(
        progress.playerId, progress.dateKey, progress.category, progress.roundIndex
      );
      if (rows[0]) {
        memoryDailyProgress.set(key, rows[0]);
        return rows[0];
      }
      return getOrCreateInMemory();
    } catch {
      return getOrCreateInMemory();
    }
  },

  async getDailyRoundProgress(
    playerId: string,
    dateKey: string,
    category: CategoryType,
    roundIndex?: number
  ): Promise<DailyRoundProgress[]> {
    const getFromMemory = (): DailyRoundProgress[] => {
      const list: DailyRoundProgress[] = [];
      for (const item of memoryDailyProgress.values()) {
        if (
          item.playerId === playerId &&
          item.dateKey === dateKey &&
          item.category === category &&
          (roundIndex === undefined || item.roundIndex === roundIndex)
        ) {
          list.push(item);
        }
      }
      return list.sort((a, b) => a.roundIndex - b.roundIndex);
    };

    if (!isSupabaseConfigured()) return [];
    if (remoteDailyProgressTableAvailable === false) {
      return getFromMemory();
    }
    const indexFilter = roundIndex === undefined ? '' : `&round_index=eq.${roundIndex}`;
    try {
      const res = await supabaseFetch(getRestUrl(
        `daily_round_progress?player_id=eq.${encodeURIComponent(playerId)}&date_key=eq.${encodeURIComponent(dateKey)}&category=eq.${encodeURIComponent(category)}${indexFilter}&select=*&order=round_index.asc`
      ), { headers: getSupabaseHeaders() });
      if (!res.ok) {
        if (isMissingOrDeniedTableStatus(res.status)) {
          remoteDailyProgressTableAvailable = false;
        }
        return getFromMemory();
      }
      remoteDailyProgressTableAvailable = true;
      const rows = await res.json() as Array<Record<string, unknown>>;
      const mapped = rows.map((row) => {
        const item: DailyRoundProgress = {
          playerId: String(row.player_id),
          dateKey: String(row.date_key),
          category: row.category as CategoryType,
          roundIndex: Number(row.round_index),
          trackId: String(row.track_id),
          startedAt: Number(row.started_at),
          status: row.status as DailyRoundProgress['status'],
          score: Number(row.score),
          speedBonus: Number(row.speed_bonus),
          answerTimeMs: Number(row.answer_time_ms),
        };
        memoryDailyProgress.set(
          dailyProgressKey(item.playerId, item.dateKey, item.category, item.roundIndex),
          item
        );
        return item;
      });
      return mapped;
    } catch {
      return getFromMemory();
    }
  },

  async finalizeDailyRoundProgress(input: {
    playerId: string;
    dateKey: string;
    category: CategoryType;
    roundIndex: number;
    trackId: string;
    status: Exclude<DailyRoundProgress['status'], 'pending'>;
    score: number;
    speedBonus: number;
    answerTimeMs: number;
  }): Promise<{ updated: boolean; progress: DailyRoundProgress | null }> {
    const key = dailyProgressKey(
      input.playerId,
      input.dateKey,
      input.category,
      input.roundIndex
    );
    const finalizeInMemory = (): { updated: boolean; progress: DailyRoundProgress | null } => {
      const existing = memoryDailyProgress.get(key);
      if (existing && existing.status !== 'pending') {
        return { updated: false, progress: existing };
      }
      const finalized: DailyRoundProgress = {
        playerId: input.playerId,
        dateKey: input.dateKey,
        category: input.category,
        roundIndex: input.roundIndex,
        trackId: input.trackId,
        startedAt: existing?.startedAt ?? Math.max(0, Date.now() - input.answerTimeMs),
        status: input.status,
        score: input.score,
        speedBonus: input.speedBonus,
        answerTimeMs: input.answerTimeMs,
      };
      memoryDailyProgress.set(key, finalized);
      return { updated: true, progress: finalized };
    };

    if (!isSupabaseConfigured()) return { updated: false, progress: null };
    if (remoteDailyProgressTableAvailable === false) {
      return finalizeInMemory();
    }
    try {
      const res = await supabaseFetch(getRestUrl(
        `daily_round_progress?player_id=eq.${encodeURIComponent(input.playerId)}&date_key=eq.${encodeURIComponent(input.dateKey)}&category=eq.${encodeURIComponent(input.category)}&round_index=eq.${input.roundIndex}&status=eq.pending`
      ), {
        method: 'PATCH',
        headers: getSupabaseHeaders('return=representation'),
        body: JSON.stringify({
          track_id: input.trackId,
          status: input.status,
          score: input.score,
          speed_bonus: input.speedBonus,
          answer_time_ms: input.answerTimeMs,
        }),
      });
      if (!res.ok) {
        if (isMissingOrDeniedTableStatus(res.status)) {
          remoteDailyProgressTableAvailable = false;
        }
        return finalizeInMemory();
      }
      remoteDailyProgressTableAvailable = true;
      const rows = await res.json() as Array<Record<string, unknown>>;
      if (rows[0]) {
        const progress: DailyRoundProgress = {
          playerId: String(rows[0].player_id),
          dateKey: String(rows[0].date_key),
          category: rows[0].category as CategoryType,
          roundIndex: Number(rows[0].round_index),
          trackId: String(rows[0].track_id),
          startedAt: Number(rows[0].started_at),
          status: rows[0].status as DailyRoundProgress['status'],
          score: Number(rows[0].score),
          speedBonus: Number(rows[0].speed_bonus),
          answerTimeMs: Number(rows[0].answer_time_ms),
        };
        memoryDailyProgress.set(key, progress);
        return { updated: true, progress };
      }

      const existingRows = await this.getDailyRoundProgress(
        input.playerId,
        input.dateKey,
        input.category,
        input.roundIndex
      );
      if (existingRows[0] && existingRows[0].status !== 'pending') {
        memoryDailyProgress.set(key, existingRows[0]);
        return { updated: false, progress: existingRows[0] };
      }
      return finalizeInMemory();
    } catch {
      return finalizeInMemory();
    }
  },

  async submitDailyLeaderboard(entry: DailyLeaderboardEntry): Promise<{ inserted: boolean; entry: DailyLeaderboardEntry | null }> {
    const key = dailyLeaderboardKey(entry.playerId, entry.dateKey, entry.category);
    const submitInMemory = (): { inserted: boolean; entry: DailyLeaderboardEntry | null } => {
      const existing = memoryDailyLeaderboard.get(key);
      if (existing) {
        return { inserted: false, entry: existing };
      }
      memoryDailyLeaderboard.set(key, entry);
      return { inserted: true, entry };
    };

    if (!isSupabaseConfigured()) return { inserted: false, entry: null };
    if (remoteDailyLeaderboardTableAvailable === false) {
      return submitInMemory();
    }
    try {
      const res = await supabaseFetch(getRestUrl('daily_leaderboard?on_conflict=player_id,date_key,category'), {
        method: 'POST',
        headers: getSupabaseHeaders('resolution=ignore-duplicates,return=representation'),
        body: JSON.stringify({
          id: entry.id,
          player_id: entry.playerId,
          date_key: entry.dateKey,
          category: entry.category,
          player_name: entry.playerName,
          score: entry.score,
          correct_count: entry.correctCount,
          skip_count: entry.skipCount,
          total_answer_time_ms: entry.totalAnswerTimeMs,
          created_at: entry.createdAt,
        }),
      });
      if (!res.ok) {
        if (isMissingOrDeniedTableStatus(res.status)) {
          remoteDailyLeaderboardTableAvailable = false;
        }
        return submitInMemory();
      }
      remoteDailyLeaderboardTableAvailable = true;
      const rows = await res.json() as Array<Record<string, unknown>>;
      const row = rows[0];
      if (!row) {
        const prior = await this.getDailyLeaderboard(entry.dateKey, entry.category, 500);
        const existing = prior.find((item) => item.playerId === entry.playerId) || memoryDailyLeaderboard.get(key) || null;
        return { inserted: false, entry: existing };
      }
      const saved: DailyLeaderboardEntry = {
        id: String(row.id),
        playerId: String(row.player_id),
        dateKey: String(row.date_key),
        category: row.category as CategoryType,
        playerName: String(row.player_name),
        score: Number(row.score),
        correctCount: Number(row.correct_count),
        skipCount: Number(row.skip_count),
        totalAnswerTimeMs: Number(row.total_answer_time_ms),
        createdAt: String(row.created_at),
      };
      memoryDailyLeaderboard.set(key, saved);
      return { inserted: true, entry: saved };
    } catch {
      return submitInMemory();
    }
  },

  async getDailyLeaderboard(dateKey: string, category: CategoryType, limit = 50): Promise<DailyLeaderboardEntry[]> {
    const getFromMemory = (): DailyLeaderboardEntry[] => {
      const list: DailyLeaderboardEntry[] = [];
      for (const item of memoryDailyLeaderboard.values()) {
        if (item.dateKey === dateKey && item.category === category) {
          list.push(item);
        }
      }
      return list
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.correctCount - a.correctCount ||
            a.skipCount - b.skipCount ||
            a.totalAnswerTimeMs - b.totalAnswerTimeMs ||
            a.playerName.localeCompare(b.playerName) ||
            a.id.localeCompare(b.id)
        )
        .slice(0, Math.max(1, Math.min(100, limit)));
    };

    if (!isSupabaseConfigured()) return [];
    if (remoteDailyLeaderboardTableAvailable === false) {
      return getFromMemory();
    }
    try {
      const res = await supabaseFetch(getRestUrl(
        `daily_leaderboard?date_key=eq.${encodeURIComponent(dateKey)}&category=eq.${encodeURIComponent(category)}&select=*&order=score.desc,correct_count.desc,skip_count.asc,total_answer_time_ms.asc,player_name.asc,id.asc&limit=${Math.max(1, Math.min(100, limit))}`
      ), { headers: getSupabaseHeaders() });
      if (!res.ok) {
        if (isMissingOrDeniedTableStatus(res.status)) {
          remoteDailyLeaderboardTableAvailable = false;
        }
        return getFromMemory();
      }
      remoteDailyLeaderboardTableAvailable = true;
      const rows = await res.json() as Array<Record<string, unknown>>;
      return rows.map((row) => {
        const entry: DailyLeaderboardEntry = {
          id: String(row.id),
          playerId: String(row.player_id),
          dateKey: String(row.date_key),
          category: row.category as CategoryType,
          playerName: String(row.player_name),
          score: Number(row.score),
          correctCount: Number(row.correct_count),
          skipCount: Number(row.skip_count),
          totalAnswerTimeMs: Number(row.total_answer_time_ms),
          createdAt: String(row.created_at),
        };
        memoryDailyLeaderboard.set(
          dailyLeaderboardKey(entry.playerId, entry.dateKey, entry.category),
          entry
        );
        return entry;
      });
    } catch {
      return getFromMemory();
    }
  },

  /**
   * Batch Upsert songs (ON CONFLICT (id) DO UPDATE) with controlled concurrency
   */
  async upsertSongs(songs: Song[], chunkSize = 100): Promise<number> {
    if (!isSupabaseConfigured() || songs.length === 0) return 0;
    const chunks: SupabaseSongRow[][] = [];
    for (let i = 0; i < songs.length; i += chunkSize) {
      chunks.push(songs.slice(i, i + chunkSize).map(songToRow));
    }

    let total = 0;
    const concurrency = 2;
    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (chunk, idx) => {
          try {
            const res = await supabaseFetch(getRestUrl('songs?on_conflict=id'), {
              method: 'POST',
              headers: getSupabaseHeaders('resolution=merge-duplicates,return=minimal'),
              body: JSON.stringify(chunk),
            });
            if (!res.ok) {
              const errText = await res.text().catch(() => '');
              console.error(`[Supabase upsertSongs] chunk ${i + idx + 1} failed:`, errText);
              return 0;
            }
            return chunk.length;
          } catch (err) {
            console.error(`[Supabase upsertSongs] chunk ${i + idx + 1} network error:`, (err as Error).message);
            return 0;
          }
        })
      );
      total += results.reduce((sum, n) => sum + n, 0);
    }

    const allCredits = songs.flatMap((s) => s.artists || []);
    if (allCredits.length > 0) {
      await this.upsertTrackArtists(allCredits).catch(() => {});
    }

    return total;
  },

  /**
   * Batch Upsert track_artists junction rows (ON CONFLICT (track_id, artist_id) DO UPDATE)
   */
  async upsertTrackArtists(credits: TrackArtistCredit[]): Promise<void> {
    if (!isSupabaseConfigured() || credits.length === 0 || remoteTrackArtistsTableAvailable === false) {
      return;
    }
    const deduped = new Map<string, TrackArtistCredit>();
    for (const c of credits) {
      deduped.set(`${c.trackId}::${c.artistId}`, c);
    }
    const rows = Array.from(deduped.values()).map((c) => ({
      track_id: String(c.trackId),
      artist_id: c.artistId,
      artist_name: c.artistName,
      role: c.role,
      position: c.position,
      updated_at: new Date().toISOString(),
    }));

    try {
      const res = await supabaseFetch(getRestUrl('track_artists?on_conflict=track_id,artist_id'), {
        method: 'POST',
        headers: getSupabaseHeaders('resolution=merge-duplicates,return=minimal'),
        body: JSON.stringify(rows.slice(0, 400)),
      });
      if (res.status === 404 || res.status === 400) {
        const txt = await res.text().catch(() => '');
        if (txt.includes('track_artists')) {
          remoteTrackArtistsTableAvailable = false;
        }
      } else if (res.ok) {
        remoteTrackArtistsTableAvailable = true;
      }
    } catch {}
  },

  /**
   * Upsert artist (ON CONFLICT (name) DO UPDATE)
   */
  async upsertArtist(artist: Artist): Promise<Artist> {
    if (!isSupabaseConfigured()) return artist;
    const row: SupabaseArtistRow = {
      id: artist.id,
      name: artist.name,
      category: artist.category,
      main_genre: artist.mainGenre || 'Pop',
      avatar_url: artist.avatarUrl || null,
      is_custom: artist.isCustom ?? true,
      track_count: artist.trackCount ?? 0,
      updated_at: new Date().toISOString(),
    };

    try {
      const res = await supabaseFetch(getRestUrl('artists?on_conflict=name'), {
        method: 'POST',
        headers: getSupabaseHeaders('resolution=merge-duplicates,return=representation'),
        body: JSON.stringify(row),
      });

      if (res.ok) {
        const data = (await res.json()) as SupabaseArtistRow[];
        if (data[0]) {
          return {
            id: data[0].id,
            name: data[0].name,
            category: data[0].category,
            mainGenre: data[0].main_genre || 'Pop',
            avatarUrl: data[0].avatar_url || '',
            isCustom: data[0].is_custom,
            trackCount: data[0].track_count ?? artist.trackCount ?? 0,
          };
        }
      }
    } catch (err) {
      console.warn('[Supabase upsertArtist] network warning:', (err as Error).message);
    }
    return artist;
  },

  /**
   * Find existing artist by ID or case-insensitive name
   */
  async findArtist(idOrName?: string, name?: string): Promise<Artist | null> {
    if (!isSupabaseConfigured()) return null;
    const lookupName = name || idOrName;
    const query =
      idOrName && name
        ? `artists?id=eq.${encodeURIComponent(idOrName)}&limit=1`
        : lookupName
          ? `artists?name=ilike.${encodeURIComponent(lookupName.trim())}&limit=1`
          : null;
    if (!query) return null;

    try {
      const res = await supabaseFetch(getRestUrl(query), { headers: getSupabaseHeaders() });
      if (!res.ok) return null;
      const rows = (await res.json()) as SupabaseArtistRow[];
      if (!rows[0]) return null;
      return {
        id: rows[0].id,
        name: rows[0].name,
        category: rows[0].category,
        mainGenre: rows[0].main_genre || 'Pop',
        avatarUrl: rows[0].avatar_url || '',
        isCustom: rows[0].is_custom,
        trackCount: rows[0].track_count ?? 0,
      };
    } catch {
      return null;
    }
  },

  /**
   * Fetch all registered artists from Supabase
   */
  async getArtists(): Promise<Artist[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const res = await fetch(getRestUrl('artists?select=*&order=name.asc'), {
        headers: getSupabaseHeaders(),
      });
      if (!res.ok) return [];
      const rows = (await res.json()) as SupabaseArtistRow[];
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        mainGenre: r.main_genre || 'Pop',
        avatarUrl: r.avatar_url || '',
        isCustom: r.is_custom,
        trackCount: r.track_count ?? 0,
      }));
    } catch (err) {
      console.error('[Supabase getArtists] Error:', err);
      return [];
    }
  },

  /**
   * Fetch songs for a given artist from Supabase
   */
  async findSongsByArtist(artistName: string, limit = 200): Promise<Song[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const query = `songs?artist_name=ilike.*${encodeURIComponent(artistName)}*&limit=${limit}`;
      const res = await fetch(getRestUrl(query), { headers: getSupabaseHeaders() });
      if (!res.ok) return [];
      const rows = (await res.json()) as SupabaseSongRow[];
      return rows.map(rowToSong);
    } catch (err) {
      console.error('[Supabase findSongsByArtist] Error:', err);
      return [];
    }
  },

  /**
   * Read-only: the `dz_` song id whose stored Deezer preview link contains this 32-hex file key.
   */
  async findDeezerSongIdByPreviewKey(fileKey: string): Promise<string | null> {
    if (!isSupabaseConfigured() || !/^[0-9a-f]{32}$/.test(fileKey)) return null;
    try {
      const query = `songs?id=like.dz_*&preview_url=like.*${fileKey}*&select=id&limit=1`;
      const res = await supabaseFetch(getRestUrl(query), { headers: getSupabaseHeaders() });
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<{ id?: unknown }>;
      const id = rows[0]?.id;
      return typeof id === 'string' && /^dz_\d{1,15}$/.test(id) ? id : null;
    } catch {
      return null;
    }
  },

  /**
   * Count total songs matching artistName in Supabase and update artists.track_count
   */
  async refreshArtistTrackCount(artistName: string, avatarUrl?: string): Promise<number> {
    if (!isSupabaseConfigured()) return 0;
    try {
      const countRes = await supabaseFetch(
        getRestUrl(`songs?artist_name=ilike.*${encodeURIComponent(artistName)}*&select=id`),
        { headers: getSupabaseHeaders('count=exact') }
      );
      const range = countRes.headers.get('content-range') || '';
      const total = Number(range.split('/')[1] || 0);

      if (total > 0) {
        const patch: Record<string, unknown> = {
          track_count: total,
          updated_at: new Date().toISOString(),
        };
        if (avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://'))) {
          patch.avatar_url = avatarUrl;
        }
        await supabaseFetch(getRestUrl(`artists?name=ilike.${encodeURIComponent(artistName)}`), {
          method: 'PATCH',
          headers: getSupabaseHeaders('return=minimal'),
          body: JSON.stringify(patch),
        });
      }
      return total;
    } catch {
      return 0;
    }
  },

  /**
   * Persistent Artist Sync Job Management (PostgreSQL + In-Memory Fallback)
   */
  async upsertSyncJob(job: ArtistSyncJob): Promise<ArtistSyncJob> {
    memorySyncJobs.set(job.id, job);
    if (!isSupabaseConfigured() || remoteJobsTableAvailable === false) return job;

    try {
      const res = await supabaseFetch(getRestUrl('artist_sync_jobs?on_conflict=id'), {
        method: 'POST',
        headers: getSupabaseHeaders('resolution=merge-duplicates,return=minimal'),
        body: JSON.stringify({
          id: job.id,
          artist_id: job.artistId,
          artist_name: job.artistName,
          category: job.category,
          status: job.status,
          max_limit: job.maxLimit,
          fetched_count: job.fetchedCount,
          added_count: job.addedCount,
          attempts: job.attempts,
          last_error: job.lastError ?? null,
          locked_until: job.lockedUntil ? new Date(job.lockedUntil).toISOString() : null,
          updated_at: job.updatedAt || new Date().toISOString(),
        }),
      });
      if (res.status === 404 || res.status === 400) {
        const txt = await res.text().catch(() => '');
        if (txt.includes('artist_sync_jobs')) {
          remoteJobsTableAvailable = false;
        }
      } else if (res.ok) {
        remoteJobsTableAvailable = true;
      }
    } catch {}
    return job;
  },

  async getSyncJob(jobId: string): Promise<ArtistSyncJob | null> {
    const mem = memorySyncJobs.get(jobId);
    if (!isSupabaseConfigured() || remoteJobsTableAvailable === false) {
      return mem || null;
    }
    try {
      const res = await supabaseFetch(
        getRestUrl(`artist_sync_jobs?id=eq.${encodeURIComponent(jobId)}&limit=1`),
        { headers: getSupabaseHeaders() }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        if (txt.includes('artist_sync_jobs')) remoteJobsTableAvailable = false;
        return mem || null;
      }
      remoteJobsTableAvailable = true;
      const rows = (await res.json()) as Array<{
        id: string;
        artist_id: string;
        artist_name: string;
        category: 'thai' | 'international';
        status: ArtistSyncJob['status'];
        max_limit: number;
        fetched_count: number;
        added_count: number;
        attempts: number;
        last_error: string | null;
        locked_until: string | null;
        updated_at: string;
      }>;
      if (!rows[0]) return mem || null;
      const r = rows[0];
      const loaded: ArtistSyncJob = {
        id: r.id,
        artistId: r.artist_id,
        artistName: r.artist_name,
        category: r.category,
        status: r.status,
        maxLimit: r.max_limit,
        fetchedCount: r.fetched_count,
        addedCount: r.added_count,
        attempts: r.attempts,
        lastError: r.last_error,
        lockedUntil: r.locked_until ? new Date(r.locked_until).getTime() : null,
        updatedAt: r.updated_at,
      };
      memorySyncJobs.set(loaded.id, loaded);
      return loaded;
    } catch {
      return mem || null;
    }
  },

  /**
   * Trigger PostgreSQL RPC generate_daily_challenges(target_date)
   */
  async rpcGenerateDailyChallenges(dateKey: string, signal?: AbortSignal): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const res = await supabaseFetch(getRestUrl('rpc/generate_daily_challenges'), {
        method: 'POST',
        headers: getSupabaseHeaders(),
        body: JSON.stringify({ target_date: dateKey }),
        signal,
      });
      if (!res.ok) {
        console.warn('[Daily] Challenge generation RPC unavailable', { dateKey, status: res.status });
      }
      return res.ok;
    } catch (err) {
      console.warn('[Daily] Challenge generation RPC request failed', {
        dateKey,
        errorType: err instanceof Error ? err.name : 'unknown',
      });
      return false;
    }
  },

  /**
   * Fetch or generate 5 daily challenge songs for (dateKey, category)
   */
  async getOrCreateDailyChallengeSongs(dateKey: string, category: CategoryType): Promise<Song[]> {
    if (!isSupabaseConfigured()) return [];
    const challengeDeadline = AbortSignal.timeout(8_000);

    // 1. Check daily_challenges table
    const fetchRow = async () => {
      const res = await supabaseFetch(
        getRestUrl(
          `daily_challenges?date_key=eq.${encodeURIComponent(dateKey)}&category=eq.${encodeURIComponent(category)}&limit=1`
        ),
        { headers: getSupabaseHeaders(), signal: challengeDeadline }
      );
      if (!res.ok) {
        console.warn('[Daily] Challenge lookup failed', { dateKey, category, status: res.status });
        return null;
      }
      const rows = (await res.json()) as Array<{ date_key: string; category: string; song_ids: string[] }>;
      return rows[0] || null;
    };

    let dailyRow = await fetchRow();

    // 2. Self-healing: invoke SQL RPC if missing
    if (!dailyRow || !dailyRow.song_ids?.length) {
      await this.rpcGenerateDailyChallenges(dateKey, challengeDeadline);
      dailyRow = await fetchRow();
    }

    // 3. Fallback: if RPC wasn't created yet, pick 5 songs in JS and insert into daily_challenges
    if (!dailyRow || !dailyRow.song_ids?.length) {
      const catFilter = category === 'thai' || category === 'international' ? `&category=eq.${category}` : '';
      const candRes = await supabaseFetch(
        getRestUrl(`songs?select=*${catFilter}&order=popularity_score.desc&limit=100`),
        { headers: getSupabaseHeaders(), signal: challengeDeadline }
      );
      if (!candRes.ok) {
        console.warn('[Daily] Candidate song lookup failed', { dateKey, category, status: candRes.status });
      }
      const candidates = candRes.ok ? ((await candRes.json()) as SupabaseSongRow[]).map(rowToSong) : [];
      const picked: Song[] = [];
      const seenArtists = new Set<string>();
      for (const s of candidates) {
        const aKey = s.artistName.toLowerCase();
        if (!seenArtists.has(aKey)) {
          seenArtists.add(aKey);
          picked.push(s);
        }
        if (picked.length >= 5) break;
      }
      if (picked.length === 5) {
        const insertResponse = await supabaseFetch(getRestUrl('daily_challenges?on_conflict=date_key,category'), {
          method: 'POST',
          headers: getSupabaseHeaders('resolution=ignore-duplicates,return=minimal'),
          signal: challengeDeadline,
          body: JSON.stringify({
            date_key: dateKey,
            category,
            song_ids: picked.map((p) => p.id),
          }),
        });
        if (!insertResponse.ok) {
          console.warn('[Daily] Challenge persistence failed', { dateKey, category, status: insertResponse.status });
        }
        // A concurrent request may have won the unique-key insert with a different
        // deterministic sequence. Always return the persisted winner's sequence.
        dailyRow = await fetchRow();
      }
      if (!dailyRow?.song_ids?.length) return [];
    }

    // 4. Fetch the 5 songs in exact order of song_ids
    const idsParam = dailyRow.song_ids.map((id) => `"${id}"`).join(',');
    const songsRes = await supabaseFetch(getRestUrl(`songs?id=in.(${idsParam})&select=*`), {
      headers: getSupabaseHeaders(),
      signal: challengeDeadline,
    });
    if (!songsRes.ok) {
      console.warn('[Daily] Challenge track hydration failed', { dateKey, category, status: songsRes.status });
      return [];
    }
    const rows = (await songsRes.json()) as SupabaseSongRow[];
    const existingSongs = dailyRow.song_ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is SupabaseSongRow => Boolean(r))
      .map(rowToSong);

    // Historical sequences are immutable. Missing catalog rows make the challenge
    // unavailable rather than silently changing the rules for that date.
    return existingSongs.length === 5 ? existingSongs : [];
  },

  /**
   * Fetch Leaderboard entries from Supabase
   */
  async getLeaderboard(
    category?: CategoryType,
    difficulty?: string,
    limit = 50
  ): Promise<LeaderboardEntry[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const filters: string[] = ['select=*', 'order=score.desc,fastest_seconds.asc', `limit=${limit}`];
      if (category === 'thai' || category === 'international') {
        filters.push(`category=in.(${category},all)`);
      }
      if (difficulty && difficulty !== 'all') {
        filters.push(`difficulty=eq.${encodeURIComponent(difficulty)}`);
      }
      const res = await fetch(getRestUrl(`leaderboard?${filters.join('&')}`), {
        headers: getSupabaseHeaders(),
      });
      if (!res.ok) return [];
      const rows = (await res.json()) as Array<{
        id: string;
        player_name: string;
        score: number;
        streak: number;
        fastest_seconds: number | null;
        difficulty: LeaderboardEntry['difficulty'];
        category: CategoryType;
        is_daily?: boolean;
        created_at: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        playerName: r.player_name,
        score: r.score,
        streak: r.streak,
        fastestSeconds: r.fastest_seconds ?? 0,
        difficulty: r.difficulty,
        category: r.category,
        isDaily: Boolean(r.is_daily),
        createdAt: r.created_at,
      }));
    } catch (err) {
      console.error('[Supabase getLeaderboard] Error:', err);
      return [];
    }
  },

  /**
   * Batch Upsert Leaderboard entries
   */
  async upsertLeaderboard(entries: LeaderboardEntry[]): Promise<number> {
    if (!isSupabaseConfigured() || entries.length === 0) return 0;
    for (const e of entries) {
      await fetch(
        getRestUrl(
          `leaderboard?player_name=ilike.${encodeURIComponent(e.playerName)}&category=eq.${encodeURIComponent(e.category)}&difficulty=eq.${encodeURIComponent(e.difficulty)}&id=neq.${encodeURIComponent(e.id)}`
        ),
        { method: 'DELETE', headers: getSupabaseHeaders() }
      ).catch(() => {});
    }
    const rows = entries.map((e) => ({
      id: e.id,
      player_name: e.playerName,
      score: e.score,
      streak: e.streak,
      fastest_seconds: e.fastestSeconds ?? null,
      difficulty: e.difficulty,
      category: e.category,
      is_daily: Boolean(e.isDaily),
      created_at: e.createdAt || new Date().toISOString(),
    }));

    const res = await fetch(getRestUrl('leaderboard?on_conflict=id'), {
      method: 'POST',
      headers: getSupabaseHeaders('resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify(rows),
    });
    return res.ok ? rows.length : 0;
  },
};

