# Live rooms upgrades: artist & clip settings, pause, leaving, correct-answer animation (design)

Date: 2026-11-15 · Builds on `docs/superpowers/specs/2026-11-14-live-rooms-design.md`
(rooms, Everyone-answers and Buzzer modes, polling, derived timeline).

## Intent
Live rooms work, but a game with friends breaks down in small ways: the host cannot pick an
artist or a clip length, nobody can stop the game when life interrupts, leaving mid-game is
abrupt, and a correct answer is invisible to everyone else. This round of work makes a room
feel like a shared game: you see the moment someone gets it, you can ask for a break, and the
room ends cleanly when it no longer makes sense.

## Goals
1. **Artist rooms** — the host can pick an artist when creating a room (server support exists).
2. **Clip length** — host sets the clip length from 0.1 s to 15 s. Still one clip per round.
3. **Pause** — any player can ask for a pause; the host approves or declines. The host can pause
   directly.
4. **Leaving** — confirm before leaving mid-game; a game ends when only one player is left.
5. **Correct-answer animation** on every device, coloured so you can tell *you* from *others*.
6. **Buzzer timing** — 30 s per round, 10 s for the buzz holder to answer, and the round timer
   stops while the holder answers.

## Non-goals
- Clips that grow stage by stage like solo play (user chose a single fixed clip per round).
- Realtime transport (Supabase Realtime / sockets). Polling stays.
- Vote-based pausing, kicking players, chat.
- Changing Everyone-answers timing (stays 20 s window, 3 attempts) or the scoring formula.

## Anti-goals
- A pause or buzz hold that lets anyone gain points (time paused must never count as answer time,
  and must never extend anyone's thinking time for free).
- Any device deciding timing, pause state or scores — the server stays authoritative.
- Pausing or leaving rewriting the timing or scores of rounds already played.
- Breaking SQLite / in-memory (offline) room support.

## Constraints
- Timeline is **derived**, never ticked (`lib/rooms/timeline.ts`): GET stays read-only, no cron.
  Anything that ends on its own (pause auto-resume, request expiry, buzz deadline) must be
  derivable from stored timestamps.
- Clip bounds come from `MIN_SNIPPET_DURATION` / `MAX_SNIPPET_DURATION` in `shared/types.ts`
  (0.1–15 s). Seconds → ms exactly once, at the audio boundary (`useRoomAudio`).
- Compare-and-set on the room document (`updateRoom`) for every write.
- Polling ~1 s (600 ms in buzzer rounds): other players see events up to ~1 s late. Accepted.

## Approaches (user picked 1)
1. **Frozen intervals on the derived timeline (chosen).** The room stores intervals during
   which the game clock is stopped (pauses and buzz holds). Every timing calculation runs on
   this "game clock". Each interval has a known latest end, so auto-resume needs no writer.
   No new dependency, works offline, keeps fairness on the server. Cost: other devices see
   pause pop-ups / animations up to ~1 s late.
2. **Supabase Realtime** for instant pop-ups. Rejected: new dependency, no offline mode, already
   rejected in the original rooms design, and the timeline change in (1) is still needed.
3. **Shift `startedAt` on resume.** Rejected: no automatic resume at 60 s without a writer, and
   shifting the origin risks re-scoring past rounds.

## Design

### 1. Settings (create-room form + `parseRoomSettings`)
- **Artist**: an artist field in the create form (`app/[locale]/room/page.tsx`). Reuse the artist
  search already used by solo Artist Mode (look in `components/AddArtistModal.tsx` /
  `context/GameContext.tsx`, `/api/artists`). Empty = any artist. Server already filters with
  `matchesArtistFilter`. *(My call, keeps today's behaviour:)* songs are picked at Start; 0 songs
  → existing `noSongs` error in the lobby; fewer songs than rounds → the game is shorter and the
  lobby/round header shows the real count. Difficulty slicing applies as it does today.
- **Clip length**: chips 0.5 / 2 / 5 / 10 / 15 s plus a "custom" number input (step 0.1).
  Replace `ROOM_LIMITS.clipSeconds` (list) with min/max from the shared snippet constants.
  Server: parse as number, reject non-finite, clamp to 0.1–15, round to 0.1. Default stays 5 s.
- **Answer window by mode**: Everyone-answers 20 s; Buzzer 30 s. `answerSeconds` is set by the
  server from the mode (never from the client). `buzzAnswerMs` becomes 10 000.

### 2. Game clock with frozen intervals (`lib/rooms/timeline.ts`)
- New room field: `freezes: { kind: 'pause' | 'buzz'; from: number; until: number; requestedBy?: string }[]`
  (wall-clock ms). `until` is the planned latest end (pause: `from + 60 s`; buzz: the buzz
  deadline). Resuming early / answering early **shortens** `until` to the write time.
- **Audio after a buzz (user decision):** after a wrong or timed-out buzz the clip continues from
  where it stopped, on every device that plays audio, scheduled from server time — the same
  resume path as a pause. (Today it stays silent for the rest of the round; that is a bug.)
  Clients need the clip's played position in game time (`playAt` + active elapsed time).
- Buzz holds are freezes: when a player buzzes, the round clock stops for everyone (audio already
  stops for everyone). This replaces today's "a late buzz still gets its full time" special case.
- `locate(room, now)` works in game time: every stored duration (countdown, answer window,
  reveal) advances only outside freezes. Phase while inside a pause = the phase it was paused in,
  plus `paused` info in the view.
- Scoring: `scoreForAnswer` uses **active elapsed time** (wall time minus frozen time) between
  `playAt` and the answer (Everyone-answers) or the buzz (Buzzer). Points are written once at
  answer time, as today, so later freezes cannot change them.
- Past rounds: freezes only affect times after their `from`, so finished rounds never move.
- Builder's call: whether to store game-time or wall-time on events, as long as the above holds.
  Keep it pure and covered by unit tests (see Testing).

### 3. Pause flow
- **While paused** *(my call)*: answers and buzzes are rejected by the server and the input /
  buzzer / replay are disabled; audio stops everywhere. Everyone gets the same extra thinking
  time, which is accepted as fair. Nobody — host included — can pause during a buzz hold, so the
  holder's 10 s deadline never stretches.
- **Request** (`POST /api/rooms/[code]/pause` with `{ action: 'request' }`): any active non-host
  player, allowed in countdown / guessing / reveal, not during a buzz hold, not while paused.
  Stored as `pauseRequest: { playerId, at }`; expires 10 s after `at` (derived). One pending
  request per room; the same player may request again 30 s after their last request.
- **Host decides** (`{ action: 'approve' | 'decline' }`): approve creates a `pause` freeze from
  now, `requestedBy` = requester. Decline clears the request. Host can `{ action: 'pause' }`
  directly and `{ action: 'resume' }` at any time. Only the host resumes (plus auto-resume).
- **Auto-resume** at 60 s (derived from `until`). After any resume, a 3 s "resuming" countdown
  runs before the clock moves again (part of the freeze, so it costs no game time).
- **View** adds: `pause?: { byName; until; resumingAt? }` and, for the host only,
  `pauseRequest?: { playerName; expiresAt }`; for the requester, the state of their request
  (pending / declined / expired).
- **Audio on resume**: the clip continues from where it stopped (`useRoomAudio` already supports a
  start offset); the Replay button still works.
- **UI**: a "Pause" button in the round view (host: pauses; others: asks). Host gets a modal pop-up
  "<name> wants a break — Allow / Not now" with a 10 s bar. Everyone sees a paused overlay
  "Paused by <name>" with the time remaining and, for the host, "Resume".
- If the host leaves while a request is pending, the request is dropped; the new host controls an
  active pause.

### 4. Leaving
- Keep current behaviour: leaver marked `leftAt`, host role passes on, game continues with ≥2.
- New: if a leave during countdown / guessing / reveal leaves **one** active player in a game that
  started with ≥2, the game ends at once (stored `endedAt` on the write; `locate` returns
  `finished`). Results screen says the others left. A room started alone (testing) is unaffected.
- A leave during a pause or buzz hold ends that freeze if the leaver owned it (buzz holder), so
  the game does not wait for someone who is gone.
- "Leave the game?" confirmation dialog when leaving mid-game (not in lobby / results).
- **Scope (user decision):** only an explicit leave counts. A closed tab / lost connection still
  counts as present (no heartbeat or last-seen tracking in this work; that is a later task).

### 5. Correct-answer animation
- View adds `correct: { playerId; name; points; at }[]` for the current round (who got it, never
  what the answer was).
- Client animates each entry once (keyed `roundIndex:playerId`); entries older than ~3 s on first
  sight (e.g. after refresh) are not animated.
- **Everyone-answers: A + B** — a toast drops in from the top for ~2 s ("You got it! +850" /
  "Mind got it +720"), queued if several arrive together; at the same time that player's
  scoreboard row pops (scale ~1.08, glow in their colour) with "+points" floating up.
- **Buzzer: C** — a big centre burst (ring with ✓ for you or the player's initial, plus name and
  points) for ~1.5 s, since the song ends at once anyway.
- **Colours**: you are always the app accent green; every other player gets a stable colour from a
  fixed non-green palette by join order (so up to 11 others are distinguishable). The colour also
  marks their scoreboard row.
- Respect `prefers-reduced-motion` (fade only) and announce via a polite live region.

## Testing
- Unit tests (pure timeline): freezes shift later phases only; scoring excludes frozen time;
  auto-resume at 60 s; request expiry 10 s and 30 s cool-down; buzz hold freezes clock and
  scores from buzz; last-player-left ends game; past rounds unchanged after later freezes.
  If no test runner exists, propose the smallest setup first (do not assume `npm test`).
- `npm run typecheck`, `npm run build`.
- Browser: two+ sessions, both modes, both audio set-ups, mobile + desktop, refresh during pause.

## Left to the builder
Exact copy (TH/EN in the existing `Room` messages), palette values, animation easing,
endpoint shape details, whether the clock stores game time or wall time.
