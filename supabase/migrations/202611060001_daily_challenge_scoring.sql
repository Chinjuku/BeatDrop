-- Daily Challenge scoring is stored separately so historical leaderboard rows
-- remain untouched. The service role accesses these tables through the API.
CREATE TABLE IF NOT EXISTS public.daily_round_progress (
  player_id uuid NOT NULL,
  date_key date NOT NULL,
  category text NOT NULL CHECK (category IN ('all', 'thai', 'international')),
  round_index smallint NOT NULL CHECK (round_index BETWEEN 0 AND 4),
  track_id text NOT NULL,
  started_at bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'correct', 'wrong', 'skipped', 'expired')),
  score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN -300 AND 1000),
  speed_bonus integer NOT NULL DEFAULT 0 CHECK (speed_bonus BETWEEN 0 AND 500),
  answer_time_ms integer NOT NULL DEFAULT 0 CHECK (answer_time_ms >= 0),
  PRIMARY KEY (player_id, date_key, category, round_index)
);

CREATE TABLE IF NOT EXISTS public.daily_leaderboard (
  id text PRIMARY KEY,
  player_id uuid NOT NULL,
  date_key date NOT NULL,
  category text NOT NULL CHECK (category IN ('all', 'thai', 'international')),
  player_name text NOT NULL CHECK (length(trim(player_name)) BETWEEN 1 AND 24),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 5000),
  correct_count smallint NOT NULL CHECK (correct_count BETWEEN 0 AND 5),
  skip_count smallint NOT NULL CHECK (skip_count BETWEEN 0 AND 5),
  total_answer_time_ms integer NOT NULL CHECK (total_answer_time_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, date_key, category)
);

CREATE INDEX IF NOT EXISTS daily_leaderboard_rank_idx
  ON public.daily_leaderboard (
    date_key, category, score DESC, correct_count DESC, skip_count ASC,
    total_answer_time_ms ASC, player_name ASC, id ASC
  );

ALTER TABLE public.daily_round_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_leaderboard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_round_progress FROM anon, authenticated;
REVOKE ALL ON public.daily_leaderboard FROM anon, authenticated;
GRANT ALL ON public.daily_round_progress TO service_role;
GRANT ALL ON public.daily_leaderboard TO service_role;
