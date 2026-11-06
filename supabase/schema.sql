-- ============================================================================
-- BeatDrop — Supabase PostgreSQL Schema (DDL), Indexes & Daily Cron Automation
-- Run this script in the Supabase SQL Editor
-- ============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- 2. Table: artists (Curated & Custom Artists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.artists (
  id TEXT PRIMARY KEY,
  name CITEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('thai', 'international')),
  main_genre TEXT NOT NULL DEFAULT 'Pop',
  avatar_url TEXT,
  is_custom BOOLEAN NOT NULL DEFAULT true,
  track_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artists_category ON public.artists (category);
CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON public.artists USING GIN (name gin_trgm_ops);

-- ============================================================================
-- 3. Table: songs (Permanent catalog of Thai & International tracks)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id TEXT,
  artist_name CITEXT NOT NULL,
  album_name TEXT DEFAULT 'Single',
  release_year SMALLINT,
  release_date TEXT,
  genre TEXT NOT NULL DEFAULT 'Pop',
  category TEXT NOT NULL CHECK (category IN ('thai', 'international')),
  preview_url TEXT NOT NULL,
  artwork_url TEXT,
  track_view_url TEXT,
  popularity_score REAL NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- B-Tree indexes for ModeSelector filtering (Category, Artist, Release Year, Genre)
CREATE INDEX IF NOT EXISTS idx_songs_category_pop ON public.songs (category, popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_songs_cat_genre_year_pop ON public.songs (category, genre, release_year, popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON public.songs (artist_id);
CREATE INDEX IF NOT EXISTS idx_songs_artist_name ON public.songs (artist_name);
CREATE INDEX IF NOT EXISTS idx_songs_release_year ON public.songs (release_year);
CREATE INDEX IF NOT EXISTS idx_songs_genre ON public.songs (genre);

-- GIN Trigram indexes for fast autocomplete search (ILIKE '%query%')
CREATE INDEX IF NOT EXISTS idx_songs_title_trgm ON public.songs USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_songs_artist_trgm ON public.songs USING GIN (artist_name gin_trgm_ops);

-- ============================================================================
-- 3b. Table: track_artists (Normalized Many-to-Many Track <-> Artist Credits)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.track_artists (
  track_id TEXT NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL,
  artist_name CITEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'featured', 'collaborator')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (track_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_track_artists_artist_id ON public.track_artists (artist_id);
CREATE INDEX IF NOT EXISTS idx_track_artists_artist_name ON public.track_artists (artist_name);


-- ============================================================================
-- 4. Table: daily_challenges (Deterministic 5 songs per day per category)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daily_challenges (
  date_key DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('thai', 'international', 'all')),
  song_ids TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (date_key, category),
  CONSTRAINT chk_daily_five_songs CHECK (array_length(song_ids, 1) = 5)
);

-- ============================================================================
-- 5. Table: leaderboard (Player Rankings for Standard & Daily Challenge)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.leaderboard (
  id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  streak INTEGER NOT NULL DEFAULT 0,
  fastest_seconds REAL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert', 'impossible')),
  category TEXT NOT NULL CHECK (category IN ('thai', 'international', 'all')),
  is_daily BOOLEAN NOT NULL DEFAULT false,
  date_key DATE DEFAULT (NOW() AT TIME ZONE 'Asia/Bangkok')::DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_ranking
  ON public.leaderboard (category, is_daily, score DESC, fastest_seconds ASC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cat_diff_score
  ON public.leaderboard (category, difficulty, score DESC, fastest_seconds ASC);

-- ==========================================================================
-- 5a. Daily Challenge progress and ranking (also kept in migration 001)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daily_round_progress (
  player_id UUID NOT NULL,
  date_key DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('all', 'thai', 'international')),
  round_index SMALLINT NOT NULL CHECK (round_index BETWEEN 0 AND 4),
  track_id TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'correct', 'wrong', 'skipped', 'expired')),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN -300 AND 1000),
  speed_bonus INTEGER NOT NULL DEFAULT 0 CHECK (speed_bonus BETWEEN 0 AND 500),
  answer_time_ms INTEGER NOT NULL DEFAULT 0 CHECK (answer_time_ms >= 0),
  PRIMARY KEY (player_id, date_key, category, round_index)
);

CREATE TABLE IF NOT EXISTS public.daily_leaderboard (
  id TEXT PRIMARY KEY,
  player_id UUID NOT NULL,
  date_key DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('all', 'thai', 'international')),
  player_name TEXT NOT NULL CHECK (length(trim(player_name)) BETWEEN 1 AND 24),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5000),
  correct_count SMALLINT NOT NULL CHECK (correct_count BETWEEN 0 AND 5),
  skip_count SMALLINT NOT NULL CHECK (skip_count BETWEEN 0 AND 5),
  total_answer_time_ms INTEGER NOT NULL CHECK (total_answer_time_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, date_key, category)
);

CREATE INDEX IF NOT EXISTS daily_leaderboard_rank_idx
  ON public.daily_leaderboard (
    date_key, category, score DESC, correct_count DESC, skip_count ASC,
    total_answer_time_ms ASC, player_name ASC, id ASC
  );

-- ==========================================================================
-- 5b. Song Guesser terminal results (also kept in migration 002)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.guesser_round_results (
  round_id TEXT PRIMARY KEY,
  result TEXT NOT NULL CHECK (result IN ('correct', 'wrong', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5b. Table: artist_sync_jobs (Persistent Background Job State & Recovery)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.artist_sync_jobs (
  id TEXT PRIMARY KEY,
  artist_id TEXT NOT NULL,
  artist_name CITEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'thai' CHECK (category IN ('thai', 'international')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  max_limit INTEGER NOT NULL DEFAULT 50,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  added_count INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artist_sync_jobs_status
  ON public.artist_sync_jobs (status, locked_until);
CREATE INDEX IF NOT EXISTS idx_artist_sync_jobs_artist_name
  ON public.artist_sync_jobs (artist_name);

-- ============================================================================
-- 5c. Row Level Security (RLS) Policies
-- ============================================================================
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_round_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guesser_round_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_round_progress, public.daily_leaderboard, public.guesser_round_results FROM anon, authenticated;
GRANT ALL ON public.daily_round_progress, public.daily_leaderboard, public.guesser_round_results TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'artists' AND policyname = 'Allow public read artists') THEN
    CREATE POLICY "Allow public read artists" ON public.artists FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'songs' AND policyname = 'Allow public read songs') THEN
    CREATE POLICY "Allow public read songs" ON public.songs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'track_artists' AND policyname = 'Allow public read track_artists') THEN
    CREATE POLICY "Allow public read track_artists" ON public.track_artists FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_challenges' AND policyname = 'Allow public read daily_challenges') THEN
    CREATE POLICY "Allow public read daily_challenges" ON public.daily_challenges FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leaderboard' AND policyname = 'Allow public read leaderboard') THEN
    CREATE POLICY "Allow public read leaderboard" ON public.leaderboard FOR SELECT USING (true);
  END IF;
END $$;

-- ============================================================================
-- 6. Daily Challenge Generator Function & pg_cron Schedule (00:00 UTC+7)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_daily_challenges(
  target_date DATE DEFAULT (NOW() AT TIME ZONE 'Asia/Bangkok')::DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cat TEXT;
  picked_ids TEXT[];
BEGIN
  FOREACH cat IN ARRAY ARRAY['thai', 'international', 'all']
  LOOP
    -- Pick 5 songs from 5 distinct artists, avoiding songs used in the last 7 days
    SELECT ARRAY(
      SELECT id FROM (
        SELECT DISTINCT ON (s.artist_name) s.id, random() AS rnd
        FROM public.songs s
        WHERE (cat = 'all' OR s.category = cat)
          AND s.id NOT IN (
            SELECT unnest(dc.song_ids)
            FROM public.daily_challenges dc
            WHERE dc.category = cat
              AND dc.date_key >= (target_date - INTERVAL '7 days')
          )
        ORDER BY s.artist_name, random()
      ) unique_artists
      ORDER BY rnd
      LIMIT 5
    ) INTO picked_ids;

    -- Fallback if pool has fewer than 5 unique artists
    IF COALESCE(array_length(picked_ids, 1), 0) < 5 THEN
      SELECT ARRAY(
        SELECT s.id
        FROM public.songs s
        WHERE (cat = 'all' OR s.category = cat)
        ORDER BY random()
        LIMIT 5
      ) INTO picked_ids;
    END IF;

    IF array_length(picked_ids, 1) = 5 THEN
      INSERT INTO public.daily_challenges (date_key, category, song_ids)
      VALUES (target_date, cat, picked_ids)
      ON CONFLICT (date_key, category) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Schedule at 17:00 UTC every day = 00:00:00 (UTC+7 Asia/Bangkok)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'beatdrop-daily-challenge-bkk',
      '0 17 * * *',
      $cron$SELECT public.generate_daily_challenges((NOW() AT TIME ZONE 'Asia/Bangkok')::DATE);$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
END;
$$;

