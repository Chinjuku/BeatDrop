# Live rooms (design)

Date: 2026-11-14 · Branch: `feat/live-rooms`

## Intent
Play BeatDrop with friends in real time: one player creates a room, friends join with a short
code or link, everyone hears the same clip and races to name it, and a shared scoreboard
updates every round. It must work both when friends sit together (one device plays the audio)
and when they are apart (every phone plays the clip at the same moment).

## Goals
- Create / join a room by a 5-character code or link, no account.
- Two room modes, picked by the host: **Everyone answers** (each player guesses, faster
  correct answers score more) and **Buzzer** (first to buzz answers; wrong = locked out).
- Two audio set-ups: **Same place** (only the host device plays) and **Apart** (every device
  plays at a server-scheduled time, corrected for each device's clock offset).
- Server-authoritative timing, answers and scores.

## Non-goals (for now)
- Accounts, chat, public room lists, persistence beyond ~2 hours.
- Connection to the global leaderboard or Daily Challenge.

## Anti-goals
- A client deciding scores, answer order or timing.
- Rooms breaking the existing single-player modes.

## Approaches
1. **Polling + shared room store** (chosen by the user). Clients poll `GET /api/rooms/[code]`
   about once a second; state lives in Upstash Redis (in memory for local dev). Answers and
   buzzes are timestamped when the server receives them, so polling delay only affects when
   others *see* results. No new dependency.
2. Supabase Realtime: ~100 ms updates but adds `supabase-js` and a client key, no SQLite
   offline support, still needs our API for scoring.
3. Hosted sockets (Pusher/Ably/PartyKit): new paid external service.

## Design
- **State** (`shared/roomTypes.ts`, `lib/rooms/*`): one JSON document per room with a
  `version` for compare-and-set. Song order is fixed when the game starts.
- **Timeline is derived, not ticked** (`lib/rooms/timeline.ts`, pure): from `startedAt` and each
  round's `finishedAt` (set when every player is done), the server computes the current
  phase (`countdown` 3 s → `guessing` → `reveal` 6 s → next … → `finished`). So `GET` is
  read-only and no cron or timer is needed.
- **Scoring (Everyone answers)**: correct = 1000 → 100 points, falling linearly over the
  answer window, measured from the scheduled play time to server receipt. 3 attempts per
  round (my call: stops "try every song" spam, forgives one typo).
- **Store**: Upstash Redis with a Lua compare-and-set when configured; in-memory store for local
  dev / offline mode (single process). On Vercel without Redis, rooms answer 503 with a clear
  message. TTL 2 hours.
- **Identity**: joining returns `playerId` + a signed token (HMAC with `GAME_TOKEN_SECRET`),
  kept in `sessionStorage` (strictly necessary, survives refresh). Host = creator.
- **Songs**: picked with the same catalog rules as solo (library pool, artist filter that also
  accepts cloud-only artists, difficulty slicing shared with `roundEngine`).
- **Rate limits**: polling uses its own per-player limit, not the shared 60/min IP limit (friends
  on one Wi-Fi share an IP).
- **Client**: `/room` (create / join) and `/room/[code]` (lobby, round, reveal, results). One
  persistent `<audio>` element unlocked by a tap (iOS), scheduled with the clock offset
  estimated from the lowest-latency poll. Guess input reuses `GuessAutocomplete`.
- Limits (my calls): 2–12 players, 5/10/15 rounds, clip 2/5/10 s, answer window 20 s.

## Buzzer rules (my calls)
- Buzzing opens only while guessing; the holder gets 8 s to give one answer and the clip stops
  for everyone meanwhile.
- Correct: scored by *buzz* time (thinking time is not penalised), the song ends at once.
- Wrong or out of time: locked out for that song; the buzzer is free again. No negative points.
- A buzz pressed just before the 20 s timer still gets its full 8 s.
- The early end of a round is only stored by write requests (answer / leave), never re-derived
  from the current player list, so leaving later cannot shift past rounds.

## Phases
1. Rooms + Everyone answers + both audio set-ups (this branch).
2. Buzzer mode (this branch).
3. Polish: presence/kick, share card.

## Left to the builder
Exact copy, layout details, poll back-off when the tab is hidden.
