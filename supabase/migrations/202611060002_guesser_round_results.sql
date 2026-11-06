-- One terminal Song Guesser action per signed round across serverless instances.
CREATE TABLE IF NOT EXISTS public.guesser_round_results (
  round_id text PRIMARY KEY,
  result text NOT NULL CHECK (result IN ('correct', 'wrong', 'skipped')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guesser_round_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guesser_round_results FROM anon, authenticated;
GRANT ALL ON public.guesser_round_results TO service_role;
