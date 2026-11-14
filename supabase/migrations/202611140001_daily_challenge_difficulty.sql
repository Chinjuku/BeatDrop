-- Daily Challenge archive: store every difficulty's song sequence, not only Easy.
--
-- Before: daily_challenges was keyed by (date_key, category) and only held Easy. Harder
-- difficulties were recomputed from the live catalog, so a past date could resolve to
-- different songs after artists were added. After: one immutable row per
-- (date_key, category, difficulty).
--
-- Safe forward migration: existing rows become difficulty = 'easy' (what they always were).
-- No rows are deleted or rewritten. Run before (or together with) the app deploy; the app
-- falls back to the old shape while the column is missing.
--
-- Rollback (only if no non-easy rows need keeping):
--   DELETE FROM public.daily_challenges WHERE difficulty <> 'easy';
--   ALTER TABLE public.daily_challenges DROP CONSTRAINT daily_challenges_pkey;
--   ALTER TABLE public.daily_challenges ADD PRIMARY KEY (date_key, category);
--   ALTER TABLE public.daily_challenges DROP COLUMN difficulty;
--   (and restore the previous generate_daily_challenges body)

BEGIN;

ALTER TABLE public.daily_challenges
  ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'easy';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_daily_challenge_difficulty'
  ) THEN
    ALTER TABLE public.daily_challenges
      ADD CONSTRAINT chk_daily_challenge_difficulty
      CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert', 'impossible'));
  END IF;
END;
$$;

-- Re-key: one sequence per date, category and difficulty.
ALTER TABLE public.daily_challenges DROP CONSTRAINT IF EXISTS daily_challenges_pkey;
ALTER TABLE public.daily_challenges ADD PRIMARY KEY (date_key, category, difficulty);

-- Archive listing reads "dates for a category + difficulty, newest first".
CREATE INDEX IF NOT EXISTS idx_daily_challenges_archive
  ON public.daily_challenges (category, difficulty, date_key DESC);

-- The generator only creates Easy rows; its ON CONFLICT target must match the new key.
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
    SELECT ARRAY(
      SELECT id FROM (
        SELECT DISTINCT ON (s.artist_name) s.id, random() AS rnd
        FROM public.songs s
        WHERE (cat = 'all' OR s.category = cat)
          AND s.id NOT IN (
            SELECT unnest(dc.song_ids)
            FROM public.daily_challenges dc
            WHERE dc.category = cat
              AND dc.difficulty = 'easy'
              AND dc.date_key >= (target_date - INTERVAL '7 days')
          )
        ORDER BY s.artist_name, random()
      ) unique_artists
      ORDER BY rnd
      LIMIT 5
    ) INTO picked_ids;

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
      INSERT INTO public.daily_challenges (date_key, category, difficulty, song_ids)
      VALUES (target_date, cat, 'easy', picked_ids)
      ON CONFLICT (date_key, category, difficulty) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
