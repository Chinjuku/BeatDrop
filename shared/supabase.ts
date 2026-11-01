import type { Artist, CategoryType, LeaderboardEntry, Song } from './types';

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
  /**
   * Batch Upsert songs (ON CONFLICT (id) DO UPDATE)
   */
  async upsertSongs(songs: Song[], chunkSize = 50): Promise<number> {
    if (!isSupabaseConfigured() || songs.length === 0) return 0;
    let total = 0;

    for (let i = 0; i < songs.length; i += chunkSize) {
      const chunk = songs.slice(i, i + chunkSize).map(songToRow);
      const res = await fetch(getRestUrl('songs?on_conflict=id'), {
        method: 'POST',
        headers: getSupabaseHeaders('resolution=merge-duplicates,return=minimal'),
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[Supabase upsertSongs] chunk ${i / chunkSize + 1} failed:`, errText);
      } else {
        total += chunk.length;
      }
    }
    return total;
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

    const res = await fetch(getRestUrl('artists?on_conflict=name'), {
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
    return artist;
  },

  /**
   * Find existing artist by ID or case-insensitive name
   */
  async findArtist(id?: string, name?: string): Promise<Artist | null> {
    if (!isSupabaseConfigured()) return null;
    const query = id
      ? `artists?id=eq.${encodeURIComponent(id)}&limit=1`
      : name
        ? `artists?name=ilike.${encodeURIComponent(name.trim())}&limit=1`
        : null;
    if (!query) return null;

    const res = await fetch(getRestUrl(query), { headers: getSupabaseHeaders() });
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
   * Count total songs matching artistName in Supabase and update artists.track_count
   */
  async refreshArtistTrackCount(artistName: string, avatarUrl?: string): Promise<number> {
    if (!isSupabaseConfigured()) return 0;
    const countRes = await fetch(
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
      if (avatarUrl) patch.avatar_url = avatarUrl;
      await fetch(getRestUrl(`artists?name=ilike.${encodeURIComponent(artistName)}`), {
        method: 'PATCH',
        headers: getSupabaseHeaders('return=minimal'),
        body: JSON.stringify(patch),
      });
    }
    return total;
  },

  /**
   * Trigger PostgreSQL RPC generate_daily_challenges(target_date)
   */
  async rpcGenerateDailyChallenges(dateKey: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    const res = await fetch(getRestUrl('rpc/generate_daily_challenges'), {
      method: 'POST',
      headers: getSupabaseHeaders(),
      body: JSON.stringify({ target_date: dateKey }),
    });
    return res.ok;
  },

  /**
   * Fetch or generate 5 daily challenge songs for (dateKey, category)
   */
  async getOrCreateDailyChallengeSongs(dateKey: string, category: CategoryType): Promise<Song[]> {
    if (!isSupabaseConfigured()) return [];

    // 1. Check daily_challenges table
    const fetchRow = async () => {
      const res = await fetch(
        getRestUrl(
          `daily_challenges?date_key=eq.${encodeURIComponent(dateKey)}&category=eq.${encodeURIComponent(category)}&limit=1`
        ),
        { headers: getSupabaseHeaders() }
      );
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<{ date_key: string; category: string; song_ids: string[] }>;
      return rows[0] || null;
    };

    let dailyRow = await fetchRow();

    // 2. Self-healing: invoke SQL RPC if missing
    if (!dailyRow || !dailyRow.song_ids?.length) {
      await this.rpcGenerateDailyChallenges(dateKey);
      dailyRow = await fetchRow();
    }

    // 3. Fallback: if RPC wasn't created yet, pick 5 songs in JS and insert into daily_challenges
    if (!dailyRow || !dailyRow.song_ids?.length) {
      const catFilter = category === 'thai' || category === 'international' ? `&category=eq.${category}` : '';
      const candRes = await fetch(
        getRestUrl(`songs?select=*${catFilter}&order=popularity_score.desc&limit=100`),
        { headers: getSupabaseHeaders() }
      );
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
        await fetch(getRestUrl('daily_challenges?on_conflict=date_key,category'), {
          method: 'POST',
          headers: getSupabaseHeaders('resolution=ignore-duplicates,return=minimal'),
          body: JSON.stringify({
            date_key: dateKey,
            category,
            song_ids: picked.map((p) => p.id),
          }),
        });
        return picked;
      }
      return picked;
    }

    // 4. Fetch the 5 songs in exact order of song_ids
    const idsParam = dailyRow.song_ids.map((id) => `"${id}"`).join(',');
    const songsRes = await fetch(getRestUrl(`songs?id=in.(${idsParam})&select=*`), {
      headers: getSupabaseHeaders(),
    });
    if (!songsRes.ok) return [];
    const rows = (await songsRes.json()) as SupabaseSongRow[];
    const existingSongs = dailyRow.song_ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is SupabaseSongRow => Boolean(r))
      .map(rowToSong);

    // Self-healing: if some song IDs are missing or row has < 5 songs, backfill up to 5 songs
    if (existingSongs.length < 5) {
      const catFilter = category === 'thai' || category === 'international' ? `&category=eq.${category}` : '';
      const candRes = await fetch(
        getRestUrl(`songs?select=*${catFilter}&order=popularity_score.desc&limit=150`),
        { headers: getSupabaseHeaders() }
      );
      if (candRes.ok) {
        const candidates = ((await candRes.json()) as SupabaseSongRow[]).map(rowToSong);
        const seenArtists = new Set(existingSongs.map((s) => s.artistName.toLowerCase()));
        const seenIds = new Set(existingSongs.map((s) => s.id));

        for (const s of candidates) {
          if (existingSongs.length >= 5) break;
          const aKey = s.artistName.toLowerCase();
          if (!seenIds.has(s.id) && !seenArtists.has(aKey)) {
            seenArtists.add(aKey);
            seenIds.add(s.id);
            existingSongs.push(s);
          }
        }

        for (const s of candidates) {
          if (existingSongs.length >= 5) break;
          if (!seenIds.has(s.id)) {
            seenIds.add(s.id);
            existingSongs.push(s);
          }
        }

        // Persist the repaired 5 song IDs to daily_challenges table
        if (existingSongs.length === 5) {
          await fetch(
            getRestUrl(`daily_challenges?date_key=eq.${encodeURIComponent(dateKey)}&category=eq.${encodeURIComponent(category)}`),
            {
              method: 'PATCH',
              headers: getSupabaseHeaders('return=minimal'),
              body: JSON.stringify({
                song_ids: existingSongs.map((s) => s.id),
              }),
            }
          );
        }
      }
    }

    return existingSongs;
  },

  /**
   * Batch Upsert Leaderboard entries
   */
  async upsertLeaderboard(entries: LeaderboardEntry[]): Promise<number> {
    if (!isSupabaseConfigured() || entries.length === 0) return 0;
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

