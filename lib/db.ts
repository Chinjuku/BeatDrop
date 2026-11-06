import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Artist, ArtistSyncJob, CategoryType, LeaderboardEntry, Song } from '../shared/types';
import { isDbLocal, isSupabaseConfigured, supabaseAdmin } from './supabase';
import { getArtistCandidateTokens } from './itunes';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'beatdrop.db');

function resolveDbFile(): string {
  // On Vercel Serverless, /var/task is read-only; copy seed DB to /tmp/beatdrop.db
  if (process.env.VERCEL) {
    const tmpDb = path.join(os.tmpdir(), 'beatdrop.db');
    if (!fs.existsSync(tmpDb) && fs.existsSync(LOCAL_DB_FILE)) {
      try {
        fs.copyFileSync(LOCAL_DB_FILE, tmpDb);
      } catch {}
    }
    return tmpDb;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  return LOCAL_DB_FILE;
}

const isServerlessSupabase = (): boolean => Boolean(process.env.VERCEL && isSupabaseConfigured());

let _db: DatabaseSync | null = null;
let _insertSongStmt: ReturnType<DatabaseSync['prepare']> | null = null;
let _insertArtistStmt: ReturnType<DatabaseSync['prepare']> | null = null;
let _insertLeaderboardStmt: ReturnType<DatabaseSync['prepare']> | null = null;

function ensureDb(): DatabaseSync {
  if (_db) return _db;
  const instance = new DatabaseSync(resolveDbFile());
  instance.exec('PRAGMA busy_timeout = 10000;');
  instance.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_id TEXT,
      artist_name TEXT NOT NULL,
      album_name TEXT,
      release_year INTEGER,
      release_date TEXT,
      genre TEXT,
      category TEXT NOT NULL,
      preview_url TEXT NOT NULL,
      artwork_url TEXT,
      track_view_url TEXT,
      popularity_score REAL DEFAULT 50,
      created_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs (artist_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_songs_category ON songs (category);
    CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs (genre);
    CREATE INDEX IF NOT EXISTS idx_songs_year ON songs (release_year);
    CREATE INDEX IF NOT EXISTS idx_songs_title ON songs (title COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS custom_artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      category TEXT NOT NULL,
      main_genre TEXT,
      avatar_url TEXT,
      is_custom INTEGER DEFAULT 1,
      track_count INTEGER DEFAULT 0,
      created_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_custom_artists_name ON custom_artists (name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_custom_artists_cat ON custom_artists (category);

    CREATE TABLE IF NOT EXISTS leaderboard (
      id TEXT PRIMARY KEY,
      player_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      streak INTEGER NOT NULL,
      fastest_seconds REAL,
      difficulty TEXT NOT NULL,
      category TEXT NOT NULL,
      is_daily INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_leaderboard_cat ON leaderboard (category, is_daily, score DESC);
    CREATE INDEX IF NOT EXISTS idx_leaderboard_cat_diff ON leaderboard (category, difficulty, score DESC, fastest_seconds ASC);
    CREATE INDEX IF NOT EXISTS idx_songs_cat_genre_year_pop ON songs (category, genre, release_year, popularity_score DESC);

    CREATE TABLE IF NOT EXISTS artist_sync_jobs (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL,
      artist_name TEXT NOT NULL COLLATE NOCASE,
      category TEXT NOT NULL DEFAULT 'thai',
      status TEXT NOT NULL DEFAULT 'pending',
      max_limit INTEGER NOT NULL DEFAULT 50,
      fetched_count INTEGER NOT NULL DEFAULT 0,
      added_count INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      locked_until INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON artist_sync_jobs (status, locked_until);
  `);

  _insertSongStmt = instance.prepare(`
    INSERT INTO songs (
      id, title, artist_id, artist_name, album_name, release_year, release_date,
      genre, category, preview_url, artwork_url, track_view_url, popularity_score, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      artist_id = COALESCE(excluded.artist_id, songs.artist_id),
      artist_name = excluded.artist_name,
      album_name = excluded.album_name,
      release_year = excluded.release_year,
      genre = excluded.genre,
      category = excluded.category,
      preview_url = excluded.preview_url,
      artwork_url = excluded.artwork_url,
      popularity_score = excluded.popularity_score
  `);

  _insertArtistStmt = instance.prepare(`
    INSERT INTO custom_artists (
      id, name, category, main_genre, avatar_url, is_custom, track_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      category = COALESCE(excluded.category, custom_artists.category),
      avatar_url = COALESCE(NULLIF(excluded.avatar_url, ''), custom_artists.avatar_url),
      track_count = COALESCE(excluded.track_count, custom_artists.track_count),
      main_genre = COALESCE(excluded.main_genre, custom_artists.main_genre)
  `);

  _insertLeaderboardStmt = instance.prepare(`
    INSERT INTO leaderboard (
      id, player_name, score, streak, fastest_seconds, difficulty, category, is_daily, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  _db = instance;
  return instance;
}

const db = {
  exec: (sql: string) => ensureDb().exec(sql),
  prepare: (sql: string) => ensureDb().prepare(sql),
};
const insertSongStmt = {
  run: (...args: SQLInputValue[]) => {
    ensureDb();
    return _insertSongStmt!.run(...args);
  },
};
const insertArtistStmt = {
  run: (...args: SQLInputValue[]) => {
    ensureDb();
    return _insertArtistStmt!.run(...args);
  },
};
const insertLeaderboardStmt = {
  run: (...args: SQLInputValue[]) => {
    ensureDb();
    return _insertLeaderboardStmt!.run(...args);
  },
};

// Type conversions for SQLite rows -> Song
interface SongRow {
  id: string;
  title: string;
  artist_id: string | null;
  artist_name: string;
  album_name: string | null;
  release_year: number | null;
  release_date: string | null;
  genre: string | null;
  category: string;
  preview_url: string;
  artwork_url: string | null;
  track_view_url: string | null;
  popularity_score: number | null;
  created_at: number | null;
}

function rowToSong(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    artistId: row.artist_id || undefined,
    artistName: row.artist_name,
    albumName: row.album_name || '',
    releaseYear: row.release_year || new Date().getFullYear(),
    releaseDate: row.release_date || undefined,
    genre: row.genre || 'Pop',
    category: row.category as 'thai' | 'international',
    previewUrl: row.preview_url,
    artworkUrl: row.artwork_url || '',
    trackViewUrl: row.track_view_url || undefined,
    popularityScore: row.popularity_score || 50,
  };
}

interface ArtistRow {
  id: string;
  name: string;
  category: string;
  main_genre: string | null;
  avatar_url: string | null;
  is_custom: number;
  track_count: number | null;
  created_at: number | null;
}

function rowToArtist(row: ArtistRow): Artist {
  return {
    id: row.id,
    name: row.name,
    category: row.category as 'thai' | 'international',
    mainGenre: row.main_genre || 'Pop',
    avatarUrl: row.avatar_url || '',
    isCustom: Boolean(row.is_custom),
    trackCount: row.track_count || 0,
  };
}

interface LeaderboardRow {
  id: string;
  player_name: string;
  score: number;
  streak: number;
  fastest_seconds: number | null;
  difficulty: string;
  category: string;
  is_daily: number;
  created_at: string;
}

function rowToLeaderboard(row: LeaderboardRow): LeaderboardEntry {
  return {
    id: row.id,
    playerName: row.player_name,
    score: row.score,
    streak: row.streak,
    fastestSeconds: row.fastest_seconds ?? 0,
    difficulty: row.difficulty as LeaderboardEntry['difficulty'],
    category: row.category as CategoryType,
    isDaily: Boolean(row.is_daily),
    createdAt: row.created_at,
  };
}

// ---------------- Public Database Operations ---------------- //

export const dbService = {
  /**
   * Save a single song into SQLite
   */
  saveSong(song: Song): void {
    try {
      insertSongStmt.run(
        song.id,
        song.title,
        song.artistId || null,
        song.artistName,
        song.albumName || null,
        song.releaseYear || null,
        song.releaseDate || null,
        song.genre || null,
        song.category,
        song.previewUrl,
        song.artworkUrl || null,
        song.trackViewUrl || null,
        song.popularityScore || 50,
        Date.now()
      );
    } catch (err) {
      console.error(`Failed to save song ${song.id}:`, err);
    }
  },

  /**
   * Batch save multiple songs inside a single fast transaction
   */
  saveSongs(songs: Song[], syncToCloud = false): void {
    if (!songs || songs.length === 0) return;
    if (isServerlessSupabase()) {
      if (syncToCloud) supabaseAdmin.upsertSongs(songs).catch(() => {});
      return;
    }
    try {
      db.exec('BEGIN TRANSACTION');
      for (const song of songs) {
        insertSongStmt.run(
          song.id,
          song.title,
          song.artistId || null,
          song.artistName,
          song.albumName || null,
          song.releaseYear || null,
          song.releaseDate || null,
          song.genre || null,
          song.category,
          song.previewUrl,
          song.artworkUrl || null,
          song.trackViewUrl || null,
          song.popularityScore || 50,
          Date.now()
        );
      }
      db.exec('COMMIT');
      if (syncToCloud && isSupabaseConfigured()) {
        supabaseAdmin.upsertSongs(songs).catch(() => {});
      }
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Failed to batch save songs:', err);
    }
  },

  /**
   * Retrieve all songs stored in SQLite
   */
  getAllSongs(): Song[] {
    try {
      const rows = db.prepare('SELECT * FROM songs').all() as unknown as SongRow[];
      return rows.map(rowToSong);
    } catch (err) {
      console.error('Failed to get all songs:', err);
      return [];
    }
  },

  /**
   * Total song count in SQLite database
   */
  countSongs(): number {
    try {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM songs').get() as { cnt: number };
      return row?.cnt || 0;
    } catch {
      return 0;
    }
  },

  /**
   * Search songs using indexed SQLite queries with limits
   */
  searchSongs(
    query: string,
    options: {
      category?: CategoryType;
      artist?: string;
      limit?: number;
    } = {}
  ): Song[] {
    const { category, artist, limit = 30 } = options;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (category && category !== 'all') {
      conditions.push('category = ?');
      params.push(category);
    }

    if (artist && artist !== 'any') {
      const tokens = getArtistCandidateTokens(artist);
      if (tokens.length > 0) {
        const artistConds = tokens.map(() => 'artist_name LIKE ?').join(' OR ');
        conditions.push(`(${artistConds})`);
        params.push(...tokens.map((t) => `%${t}%`));
      } else {
        conditions.push('(artist_name LIKE ? OR artist_name LIKE ?)');
        params.push(`%${artist}%`, `${artist}%`);
      }
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery && (!artist || trimmedQuery.toLowerCase() !== artist.toLowerCase())) {
      conditions.push('(title LIKE ? OR artist_name LIKE ?)');
      params.push(`%${trimmedQuery}%`, `%${trimmedQuery}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM songs ${whereClause} ORDER BY popularity_score DESC LIMIT ?`;
    params.push(limit);

    try {
      const rows = db.prepare(sql).all(...params) as unknown as SongRow[];
      return rows.map(rowToSong);
    } catch (err) {
      console.error('Failed to search songs in DB:', err);
      return [];
    }
  },

  /**
   * Custom Artists operations
   */
  getCustomArtists(): Artist[] {
    try {
      const rows = db
        .prepare('SELECT * FROM custom_artists ORDER BY created_at DESC')
        .all() as unknown as ArtistRow[];
      return rows.map(rowToArtist);
    } catch (err) {
      console.error('Failed to get custom artists:', err);
      return [];
    }
  },

  saveCustomArtist(artist: Artist, syncToCloud = false): void {
    if (isServerlessSupabase()) {
      if (syncToCloud) supabaseAdmin.upsertArtist(artist).catch(() => {});
      return;
    }
    try {
      insertArtistStmt.run(
        artist.id,
        artist.name,
        artist.category,
        artist.mainGenre || 'Pop',
        artist.avatarUrl || null,
        artist.isCustom ? 1 : 0,
        artist.trackCount || 0,
        Date.now()
      );
      if (syncToCloud && isSupabaseConfigured()) {
        supabaseAdmin.upsertArtist(artist).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to save custom artist:', err);
    }
  },

  updateArtistTrackCount(artistName: string, count: number, syncToCloud = false): void {
    if (isServerlessSupabase()) {
      if (syncToCloud) supabaseAdmin.refreshArtistTrackCount(artistName).catch(() => {});
      return;
    }
    try {
      db.prepare(
        'UPDATE custom_artists SET track_count = ? WHERE name = ? COLLATE NOCASE'
      ).run(count, artistName);
      if (syncToCloud && isSupabaseConfigured()) {
        supabaseAdmin.refreshArtistTrackCount(artistName).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to update artist track count:', err);
    }
  },

  upsertSyncJob(job: ArtistSyncJob): ArtistSyncJob {
    if (!isServerlessSupabase()) {
      try {
        db.prepare(`
          INSERT INTO artist_sync_jobs (
            id, artist_id, artist_name, category, status, max_limit,
            fetched_count, added_count, attempts, last_error, locked_until, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            artist_id = excluded.artist_id,
            artist_name = excluded.artist_name,
            category = excluded.category,
            status = excluded.status,
            max_limit = excluded.max_limit,
            fetched_count = excluded.fetched_count,
            added_count = excluded.added_count,
            attempts = excluded.attempts,
            last_error = excluded.last_error,
            locked_until = excluded.locked_until,
            updated_at = excluded.updated_at
        `).run(
          job.id,
          job.artistId,
          job.artistName,
          job.category,
          job.status,
          job.maxLimit,
          job.fetchedCount,
          job.addedCount,
          job.attempts,
          job.lastError ?? null,
          job.lockedUntil ?? null,
          job.updatedAt
        );
      } catch (err) {
        console.error('Failed to upsert sync job in SQLite:', err);
      }
    }
    if (isSupabaseConfigured()) {
      supabaseAdmin.upsertSyncJob(job).catch(() => {});
    }
    return job;
  },

  getSyncJob(jobId: string): ArtistSyncJob | null {
    if (isServerlessSupabase()) return null;
    try {
      const row = db
        .prepare('SELECT * FROM artist_sync_jobs WHERE id = ? LIMIT 1')
        .get(jobId) as
        | {
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
            locked_until: number | null;
            updated_at: string;
          }
        | undefined;
      if (!row) return null;
      return {
        id: row.id,
        artistId: row.artist_id,
        artistName: row.artist_name,
        category: row.category,
        status: row.status,
        maxLimit: row.max_limit,
        fetchedCount: row.fetched_count,
        addedCount: row.added_count,
        attempts: row.attempts,
        lastError: row.last_error,
        lockedUntil: row.locked_until,
        updatedAt: row.updated_at,
      };
    } catch {
      return null;
    }
  },

  getRecoverableSyncJobs(limit = 5): ArtistSyncJob[] {
    if (isServerlessSupabase()) return [];
    try {
      const now = Date.now();
      const rows = db
        .prepare(`
          SELECT * FROM artist_sync_jobs
          WHERE status IN ('pending', 'failed')
             OR (status = 'processing' AND (locked_until IS NULL OR locked_until < ?))
          ORDER BY updated_at ASC
          LIMIT ?
        `)
        .all(now, limit) as Array<{
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
        locked_until: number | null;
        updated_at: string;
      }>;
      return rows.map((row) => ({
        id: row.id,
        artistId: row.artist_id,
        artistName: row.artist_name,
        category: row.category,
        status: row.status,
        maxLimit: row.max_limit,
        fetchedCount: row.fetched_count,
        addedCount: row.added_count,
        attempts: row.attempts,
        lastError: row.last_error,
        lockedUntil: row.locked_until,
        updatedAt: row.updated_at,
      }));
    } catch {
      return [];
    }
  },

  deleteSyncJob(jobId: string): void {
    if (isServerlessSupabase()) return;
    try {
      db.prepare('DELETE FROM artist_sync_jobs WHERE id = ?').run(jobId);
    } catch {}
  },

  deleteSongsByArtist(artistName: string): void {
    if (isServerlessSupabase()) return;
    try {
      db.prepare('DELETE FROM songs WHERE artist_name = ?').run(artistName);
    } catch {}
  },

  deleteCustomArtist(id: string): boolean {
    if (isServerlessSupabase()) return true;
    try {
      db.prepare('DELETE FROM custom_artists WHERE id = ?').run(id);
      return true;
    } catch (err) {
      console.error('Failed to delete custom artist:', err);
      return false;
    }
  },

  /**
   * Leaderboard operations
   */
  getLeaderboard(category?: CategoryType, isDaily?: boolean, limit = 50): LeaderboardEntry[] {
    if (isServerlessSupabase()) return [];
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (category && category !== 'all') {
      conditions.push('category = ?');
      params.push(category);
    }
    if (isDaily !== undefined) {
      conditions.push('is_daily = ?');
      params.push(isDaily ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM leaderboard ${whereClause} ORDER BY score DESC, fastest_seconds ASC LIMIT ?`;
    params.push(limit);

    try {
      const rows = db.prepare(sql).all(...params) as unknown as LeaderboardRow[];
      return rows.map(rowToLeaderboard);
    } catch (err) {
      console.error('Failed to get leaderboard:', err);
      return [];
    }
  },

  addLeaderboardEntry(entry: LeaderboardEntry): void {
    if (isServerlessSupabase()) {
      supabaseAdmin.upsertLeaderboard([entry]).catch(() => {});
      return;
    }
    try {
      // Upsert: prevent duplicate entries for the same player, category, and difficulty
      db.prepare(`
        DELETE FROM leaderboard
        WHERE LOWER(player_name) = LOWER(?) AND difficulty = ? AND category = ?
      `).run(entry.playerName, entry.difficulty, entry.category);

      insertLeaderboardStmt.run(
        entry.id,
        entry.playerName,
        entry.score,
        entry.streak,
        entry.fastestSeconds || null,
        entry.difficulty,
        entry.category,
        entry.isDaily ? 1 : 0,
        entry.createdAt
      );
      if (isSupabaseConfigured()) {
        supabaseAdmin.upsertLeaderboard([entry]).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to add leaderboard entry:', err);
    }
  },

  /**
   * Migrate existing JSON files (custom-artists.json, leaderboard.json) into SQLite on startup
   */
  migrateFromJsonFiles(dataDir: string, seedLeaderboard: LeaderboardEntry[]): void {
    if (isServerlessSupabase()) return;
    try {
      // 1. Migrate custom-artists.json
      const artistFile = path.join(dataDir, 'custom-artists.json');
      if (fs.existsSync(artistFile)) {
        const raw = fs.readFileSync(artistFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const count = (db.prepare('SELECT COUNT(*) as c FROM custom_artists').get() as { c: number }).c;
          if (count === 0) {
            console.log(`[SQLite] Migrating ${parsed.length} custom artists from custom-artists.json...`);
            for (const a of parsed) {
              this.saveCustomArtist(a);
            }
          }
        }
      }

      // 2. Migrate leaderboard.json or seed
      const lbCount = (db.prepare('SELECT COUNT(*) as c FROM leaderboard').get() as { c: number }).c;
      if (lbCount === 0) {
        const lbFile = path.join(dataDir, 'leaderboard.json');
        let toInsert = seedLeaderboard;
        if (fs.existsSync(lbFile)) {
          try {
            const raw = fs.readFileSync(lbFile, 'utf-8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              toInsert = parsed;
            }
          } catch {}
        }
        console.log(`[SQLite] Seeding ${toInsert.length} leaderboard entries into SQLite...`);
        for (const entry of toInsert) {
          this.addLeaderboardEntry(entry);
        }
      }
    } catch (err) {
      console.error('[SQLite] Error during JSON migration:', err);
    }
  },
};
