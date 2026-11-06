---
name: daily-challenge
description: Use when changing Daily Challenge generation, timing, scoring, leaderboard, challenge date, or competitive integrity.
---

# Daily Challenge Skill

## Fairness invariants
- Same challenge date resolves to the same seed, track order, round count, and rules for all players.
- Use one explicit timezone consistently; product documentation currently specifies Asia/Bangkok (UTC+7).
- Do not derive different challenges from client randomness.
- Preserve historical challenge and leaderboard data.

## Timing
- Daily Challenge inherits the canonical Songspot timing configuration.
- Do not duplicate timing constants in Daily Challenge UI/API.
- Verify server and client use the same versioned configuration.

## Scoring
- Server is authoritative for answer validation, elapsed-time evaluation, score, and penalties.
- Never trust client-submitted score or elapsed time.
- Make submissions idempotent; one round cannot award multiple scores.
- Ensure skip and timeout cannot be replayed to manipulate score.
- Use deterministic leaderboard tie-breaks.

## Proposed product scoring policy (confirm current approved decision before changing)
- Correct answer: 500 base points.
- Speed bonus: up to 500, based on remaining allowed time.
- Wrong answer: 0.
- Skip: -300 points, with total score floored at 0.
- Ranking: total score desc, correct count desc, skips asc, total answer time asc.

Treat these values as a proposed product decision unless the repository or user has explicitly approved them. Do not silently alter existing scoring.

## Tests
Test fast/slow correct, wrong, skip, timeout, duplicate requests, refresh/resume, concurrent submissions, midnight boundary, timezone, and identical challenges across users.
