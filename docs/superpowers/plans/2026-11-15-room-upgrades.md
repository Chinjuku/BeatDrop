# Live rooms upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add artist + clip-length settings, host-approved pause, clean mid-game leaving, buzzer timing (30 s / 10 s, clock stops while answering) and correct-answer animations to live rooms.

**Architecture:** The derived room timeline gains a *game clock*: a list of frozen intervals (stored pauses + buzz holds derived from `round.buzzes`) during which no game time passes. `locate`, scoring and a new audio cue are computed on that clock, so GET stays read-only and auto-resume needs no writer. Pause is a new POST endpoint; the client reads new view fields (`pause`, `pauseRequest`, `audioCue`, `correct`, `colorIndex`) and renders overlays/animations.

**Tech Stack:** Next.js 15 App Router Route Handlers, React 19, TypeScript, next-intl, `node:test` via `tsx` (`npm test`), in-memory/Upstash room store.

**Spec:** `docs/superpowers/specs/2026-11-15-room-upgrades-design.md`

## Global Constraints

- Clip length 0.1–15 s from `MIN_SNIPPET_DURATION` / `MAX_SNIPPET_DURATION` (`shared/types.ts`); rounded to 0.1; default 5 s. Seconds → ms only in `hooks/useRoomAudio.ts`.
- Answer window: Everyone-answers 20 s, Buzzer 30 s, set by the server from the mode. Buzz answer time 10 000 ms.
- Pause: request expires 10 s; same player may request again 30 s after their last request; pause lasts at most 60 s; every resume (manual or auto) is followed by a 3 s resuming countdown that is part of the freeze.
- No pause (by anyone) during a buzz hold or while already paused; pause allowed only in `countdown` / `guessing` / `reveal`. While paused the server rejects answers and buzzes.
- Only the host approves/declines/resumes; the host may pause directly. Only explicit `/leave` counts as leaving.
- Game ends when a leave drops a game that started with ≥2 players to 1 active player.
- After a wrong/timed-out buzz the clip continues from where it stopped on every playing device.
- Animations: Everyone-answers = toast (A) + scoreboard row pop (B); Buzzer = centre burst (C). Viewer is always `var(--song-accent)` green; others get a stable non-green palette colour by join order. Respect `prefers-reduced-motion`; announce in a polite live region.
- No new dependencies. GET handlers stay read-only. Keep in-memory (offline) and Redis stores working. No changes to `data/beatdrop.db`.
- Copy in both `messages/en/Room.json` and `messages/th/Room.json`.

## Review Focus

1. **Refresh mid-pause / mid-buzz** — a reloaded client must show the paused overlay or buzz state from the view alone and not replay old correct animations (entries older than 3 s). → Task 6 test `correct feed ignores stale entries`.
2. **Old rooms in the store** (created before deploy, 2 h TTL) lack `pauses`, `startedWith`, have `clipSeconds` from the old list and `answerSeconds` 20 in buzzer rooms — must load and play. → Task 2 test `room without pauses field still locates`.
3. **Answer submitted in the same ms the pause starts / ends** — answers at `t` inside `[from, until)` rejected; at `until` accepted with elapsed excluding the freeze. → Task 2 test `answer exactly at freeze boundaries`.
4. **Host leaves while paused or with a pending request** — new host can resume; pending request dropped; pause still auto-resumes. → Task 4 test `host leaves during pause`.
5. **Custom clip input garbage** (`"abc"`, `-1`, `99`, `0.05`, `NaN`) → clamped/rounded or default. → Task 1 test `parses clip seconds`.

---

### Task 0: Branch

- [ ] **Step 1:** `git switch -c feat/room-upgrades main` — carry the uncommitted spec, plan and `.gitignore` change; leave `data/beatdrop.db` and `tsconfig.tsbuildinfo` modifications unstaged and untouched.
- [ ] **Step 2:** `npm test` — Expected: all existing tests pass (baseline). Record any pre-existing failures.

### Task 1: Settings — clip length, per-mode answer window, buzz time

**Files:**
- Modify: `shared/roomTypes.ts` (`ROOM_LIMITS`, `DEFAULT_ROOM_SETTINGS`)
- Modify: `lib/rooms/service.ts` (`parseRoomSettings`)
- Test: `tests/rooms.test.ts` (`room input validation`)

**Interfaces:**
- Produces: `ROOM_LIMITS.answerSeconds: { answer: 20; buzzer: 30 }`, `ROOM_LIMITS.buzzAnswerMs = 10_000`, `ROOM_LIMITS.clipPresets = [0.5, 2, 5, 10, 15]`, `ROOM_LIMITS.pauseMaxMs = 60_000`, `pauseResumeMs = 3_000`, `pauseRequestMs = 10_000`, `pauseCooldownMs = 30_000`; `parseClipSeconds(raw: unknown): number` exported from `lib/rooms/service.ts`. `ROOM_LIMITS.clipSeconds` (list) is removed.

- [ ] **Step 1: Write failing tests**
```ts
it('parses clip seconds', () => {
  assert.equal(parseClipSeconds(0.1), 0.1);
  assert.equal(parseClipSeconds('7.25'), 7.3);
  assert.equal(parseClipSeconds(0.05), 0.1);
  assert.equal(parseClipSeconds(99), 15);
  assert.equal(parseClipSeconds(-1), 0.1);
  assert.equal(parseClipSeconds('abc'), 5);
  assert.equal(parseClipSeconds(NaN), 5);
});
it('sets the answer window from the mode, ignoring the client', () => {
  assert.equal(parseRoomSettings({ mode: 'buzzer', answerSeconds: 99 }).answerSeconds, 30);
  assert.equal(parseRoomSettings({ mode: 'answer' }).answerSeconds, 20);
});
```
Update existing assertions that reference `ROOM_LIMITS.answerSeconds` / `clipSeconds` list.
- [ ] **Step 2:** `node --import tsx/esm --test tests/rooms.test.ts` — Expected: FAIL (`parseClipSeconds` not exported).
- [ ] **Step 3:** Implement constants and `parseClipSeconds` (Number(), non-finite → default 5, clamp to snippet bounds, `Math.round(x*10)/10`). `parseRoomSettings` sets `answerSeconds: ROOM_LIMITS.answerSeconds[mode]`. Fix compile errors elsewhere (`timeline.ts` uses `buzzAnswerMs`; room create page uses the old list — temporarily map `clipPresets`).
- [ ] **Step 4:** Run tests + `npm run typecheck` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(rooms): custom clip length and per-mode answer window`.

### Task 2: Game clock with frozen intervals

**Files:**
- Create: `lib/rooms/clock.ts` (pure)
- Modify: `lib/rooms/timeline.ts` (`RoomState`, `locate`, `roundEnd`, `scoreForAnswer`, `applyAnswer`, `applyBuzz`, `applyBuzzAnswer`, `buildView`)
- Modify: `shared/roomTypes.ts` (`RoomView`)
- Test: `tests/rooms.test.ts` (new `describe('game clock')`, update buzzer tests)

**Interfaces:**
- Produces (`lib/rooms/clock.ts`):
  - `interface Freeze { from: number; until: number }`
  - `activeElapsed(freezes: Freeze[], from: number, to: number): number` — `to - from` minus overlap with freezes.
  - `wallAfter(freezes: Freeze[], start: number, activeMs: number): number` — wall time when `activeMs` of unfrozen time has passed after `start`.
  - `frozenAt(freezes: Freeze[], t: number): Freeze | undefined` — `from <= t < until`.
- Produces (`timeline.ts`):
  - `RoomPause { from: number; until: number; byId: string; requestedById?: string }`; `RoomState.pauses?: RoomPause[]` (optional for old rooms).
  - `freezesOf(room: RoomState): Freeze[]` — stored pauses + every buzz in every round as `{ from: b.at, until: b.resolvedAt ?? b.deadline }`, sorted by `from`.
  - `scoreForAnswer(elapsedMs: number, answerSeconds: number): number` (signature change; same 1000 → 100 formula).
  - `RoomView.audioCue?: { at: number; fromSeconds: number }` and `RoomView.frozen?: boolean` (true inside *any* freeze — pause or buzz hold; used only to stop audio. Input lock uses `view.pause` from Task 3, so the buzz holder can still answer).

- [ ] **Step 1: Write failing tests** (pure, using `baseRoom`)
```ts
it('activeElapsed / wallAfter skip freezes', () => {
  const f = [{ from: 10, until: 20 }, { from: 30, until: 35 }];
  assert.equal(clock.activeElapsed(f, 0, 40), 25);
  assert.equal(clock.wallAfter(f, 0, 25), 40);
  assert.equal(clock.wallAfter(f, 0, 10), 10); // reached exactly when a freeze starts → before it
});
it('a pause shifts the current and later phases but not earlier rounds', () => {
  const room = baseRoom();
  const before = timeline.locate(room, 1_000 + C + 5_000);
  room.pauses = [{ from: 1_000 + C + 5_000, until: 1_000 + C + 15_000, byId: 'h' }];
  const after = timeline.locate(room, 1_000 + C + 15_000);
  assert.equal(after.endsAt, before.endsAt! + 10_000);
  assert.equal(after.playAt, before.playAt);
});
it('scoring excludes frozen time', () => { /* answer at playAt+15 s with a 10 s pause inside → elapsed 5 s → scoreForAnswer(5000, 20) */ });
it('answer exactly at freeze boundaries', () => { /* at from → rejected 'paused'; at until → accepted */ });
it('a buzz freezes the round clock and scores from the buzz', () => {
  /* buzzer room (answerSeconds 30): buzz at playAt+5 s, wrong at +8 s → endsAt = playAt + 30 s + 3 s */
});
it('room without pauses field still locates', () => { const r = baseRoom(); delete (r as Partial<RoomState>).pauses; assert.equal(timeline.locate(r, 1_000).phase, 'countdown'); });
it('audio cue resumes the clip after a freeze', () => {
  /* clip 10 s, pause from playAt+4 s until playAt+14 s → view.audioCue = { at: playAt+14_000, fromSeconds: 4 }; during the pause audioCue undefined, frozen true; clip 3 s → no cue after the freeze */
});
```
Replace `a buzz just before the timer still gets its full answer time` with the same scenario expressed through the freeze (holder still gets 10 s, `endsAt` moves by the hold).
- [ ] **Step 2:** Run tests — Expected: FAIL.
- [ ] **Step 3:** Implement `clock.ts`; in `locate` use `wallAfter(freezesOf(room), …)` for countdown, answer window and reveal; `roundEnd` keeps `finishedAt` as an early wall-clock end and drops the late-buzz special case. `applyAnswer`/`applyBuzz` return `{ ok: false, reason: 'paused' }` when `frozenAt(stored pauses, now)`; buzz `too-late` uses `now >= endsAt`. Score: everyone-answers `activeElapsed(freezes, playAt, now)`, buzzer `activeElapsed(freezes, playAt, holder.at)`. `buildView` adds `frozen` and `audioCue` (at = end of the last freeze that started after `playAt`, or `playAt`; fromSeconds = active elapsed before it, rounded to 0.01; omitted if ≥ `clipSeconds`).
- [ ] **Step 4:** `npm test` + `npm run typecheck` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(rooms): game clock with frozen intervals for pauses and buzz holds`.

### Task 3: Pause rules and endpoint

**Files:**
- Create: `lib/rooms/pause.ts` (pure)
- Modify: `lib/rooms/timeline.ts` (`RoomState.pauseRequest`, `RoomState.lastPauseRequestAt`, `buildView`)
- Modify: `lib/rooms/service.ts` (`handleRoomPause`)
- Create: `app/api/rooms/[code]/pause/route.ts` (copy the `buzz/route.ts` shape)
- Modify: `shared/roomTypes.ts` (`RoomView.pause`, `RoomView.pauseRequest`, `RoomView.myPauseRequest`)
- Test: `tests/rooms.test.ts` (`describe('pause')`)

**Interfaces:**
- Consumes: `RoomPause`, `freezesOf`, `frozenAt`, `locate` (Task 2).
- Produces:
  - `type PauseAction = 'request' | 'approve' | 'decline' | 'pause' | 'resume'`
  - `RoomState.pauseRequest?: { playerId: string; at: number; decision?: 'approved' | 'declined' }`; `RoomState.lastPauseRequestAt?: Record<string, number>`
  - `applyPauseAction(room: RoomState, playerId: string, action: PauseAction, now: number): { ok: true } | { ok: false; reason: 'not-a-player' | 'not-host' | 'wrong-phase' | 'buzz-hold' | 'already-paused' | 'not-paused' | 'no-request' | 'cooldown' | 'pending' }`
  - View: `pause?: { byName: string; until: number; resumingAt: number }` (`resumingAt = until - 3000`); `pauseRequest?: { playerName: string; expiresAt: number }` (host only, pending only); `myPauseRequest?: 'pending' | 'approved' | 'declined' | 'expired'` (requester only, for 5 s after the outcome).
  - `POST /api/rooms/[code]/pause` body `{ action }` → current view (409 + view on rule failure, like buzz).

- [ ] **Step 1: Write failing tests**
```ts
it('request → host approves → paused 60 s + 3 s, answers rejected', ...);       // until = now + 63_000
it('host resume ends the pause after a 3 s resuming countdown', ...);           // until = now + 3_000
it('request expires after 10 s and cannot repeat within 30 s', ...);           // 'cooldown' at +29 s, ok at +30 s
it('only one pending request; host cannot be asked, host pauses directly', ...);
it('no pause during a buzz hold, in lobby, finished, or while paused', ...);
it('non-host cannot approve, decline or resume', ...);
it('pause auto-resumes with no write', ...);                                     // locate at from+63 s back to guessing
it('pause API returns the view and GET stays read-only', async () => { ... });
```
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement `applyPauseAction` (approve/pause push `{ from: now, until: now + pauseMaxMs + pauseResumeMs, byId, requestedById }`; resume sets `until = min(until, now + pauseResumeMs)`), `handleRoomPause` via `updateRoom`, view fields, route with `ROOM_ACTION_LIMIT`.
- [ ] **Step 4:** `npm test` + `npm run typecheck` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(rooms): host-approved pause`.

### Task 4: Leaving rules

**Files:**
- Modify: `lib/rooms/timeline.ts` (`RoomState.endedAt`, `RoomState.startedWith`, `locate`), `lib/rooms/service.ts` (`handleStartRoom`, `handleLeaveRoom`)
- Test: `tests/rooms.test.ts`

**Interfaces:**
- Produces: `RoomState.startedWith?: number`, `RoomState.endedAt?: number`, `RoomView.endedEarly?: boolean`; `applyLeave(room: RoomState, playerId: string, now: number): boolean` moved into `timeline.ts` (pure) and called by the handler.

- [ ] **Step 1: Write failing tests**
```ts
it('last remaining player ends the game at once', ...);     // 2 players, one leaves in guessing → locate finished, endedEarly true
it('a room started alone is not ended', ...);
it('buzz holder leaving ends the hold and frees the buzzer', ...); // buzz resolved 'wrong' at now, clock resumes
it('host leaves during pause: new host can resume, pending request dropped', ...);
it('leaving later does not change finished rounds', ...);
```
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement: start sets `startedWith = active count`, clears `pauses`, `pauseRequest`, `endedAt`; `applyLeave` keeps current host hand-off and `closeRoundIfEveryoneDone`, plus the rules above; `locate` returns `finished` when `endedAt !== undefined && now >= endedAt`.
- [ ] **Step 4:** `npm test` + typecheck — PASS.
- [ ] **Step 5:** Commit `feat(rooms): end the game when one player is left`.

### Task 5: Correct-answer feed and player colours in the view

**Files:**
- Modify: `lib/rooms/timeline.ts` (`buildView`), `shared/roomTypes.ts`
- Create: `shared/roomColors.ts`
- Test: `tests/rooms.test.ts`

**Interfaces:**
- Produces: `RoomView.correct: { playerId: string; name: string; points: number; at: number }[]` (current round, phases guessing/reveal, ordered by `at`; empty otherwise); `RoomPlayerView.colorIndex: number` (index in `room.players`, join order); `ROOM_PLAYER_COLORS: readonly string[]` (11 non-green hex values) and `playerColor(colorIndex: number, isMe: boolean): string` (me → `'var(--song-accent)'`).

- [ ] **Step 1: Failing tests:** `correct lists who got it, never the song` (no `reveal`/title fields in guessing); `colorIndex is stable when scores reorder players`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** Commit `feat(rooms): correct-answer feed and player colours`.

### Task 6: Client — audio cue, pause UI, leave confirmation

**Files:**
- Modify: `hooks/useRoomAudio.ts` (options `cueAt?: number; cueFromSeconds: number` replace `playAt`)
- Modify: `hooks/useRoom.ts` (`pause(action: PauseAction)` via `runAction('/pause', { action })`; `pollDelay` 600 ms while `pauseRequest` is pending for the host)
- Create: `components/room/PauseControls.tsx` (`PauseButton`, `PauseRequestDialog`, `PausedOverlay`)
- Create: `hooks/useCorrectFeed.ts` (used in Task 7; put the stale-filter logic and its test here)
- Modify: `app/[locale]/room/[code]/page.tsx`
- Modify: `messages/en/Room.json`, `messages/th/Room.json`
- Test: `tests/rooms.test.ts` (pure helper from `useCorrectFeed.ts`)

**Interfaces:**
- Consumes: view fields from Tasks 2–5; `Modal` from `components/Modal.tsx`.
- Produces: `newCorrectEntries(seen: Set<string>, roundIndex: number, entries: RoomView['correct'], now: number): RoomView['correct']` (pure; key `${roundIndex}:${playerId}`; skips entries with `now - at > 3000`, marks them seen) and `useCorrectFeed(view, now)` returning the queue.

- [ ] **Step 1:** Failing test `correct feed ignores stale entries` for `newCorrectEntries`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement hooks/components:
  - Audio: schedule at `cueAt - offsetMs` from `cueFromSeconds`; `enabled` also false when `view.frozen`; stop timer uses `clipSeconds - fromSeconds`.
  - Pause button in the round card (host label "Pause", others "Ask for a break"; disabled with reason while buzz hold / cooldown); host dialog with 10 s bar, Allow / Not now; overlay "Paused by {name}" with remaining time, "Resuming in {n}" during the last 3 s, host Resume button; requester status line.
  - Disable guess input, buzz button, Space shortcut and Replay while `view.pause` is set (not merely `frozen`, which is also true during a buzz hold).
  - Leave: confirmation `Modal` when phase is countdown/guessing/reveal; results screen copy when `endedEarly`.
- [ ] **Step 4:** `npm test`, `npm run typecheck` — PASS.
- [ ] **Step 5:** Commit `feat(rooms): pause UI, synced audio resume, leave confirmation`.

### Task 7: Client — correct-answer animations

**Files:**
- Create: `components/room/CorrectToast.tsx` (A), `components/room/CorrectBurst.tsx` (C)
- Modify: player list rows in `app/[locale]/room/[code]/page.tsx` (B pop + floating points, colour dot)
- Modify: `app/globals.css` (keyframes; `@media (prefers-reduced-motion: reduce)` → opacity only)
- Modify: `messages/*/Room.json`

**Interfaces:**
- Consumes: `useCorrectFeed`, `playerColor`, `RoomView.correct`.

- [ ] **Step 1:** Implement: Everyone-answers → toast ~2 s queued top of the round card + row pop (scale 1.08, glow in colour, "+points" floats up); Buzzer → centre burst ~1.5 s (ring with ✓ for me / initial for others, name + points). Copy: "You got it! +{points}" / "{name} got it +{points}". One `aria-live="polite"` region announces each entry.
- [ ] **Step 2:** `npm run typecheck` — PASS.
- [ ] **Step 3:** Commit `feat(rooms): correct-answer animations`.

### Task 8: Client — create form (artist + clip length)

**Files:**
- Create: `components/room/RoomArtistPicker.tsx`
- Create: `components/room/ClipLengthPicker.tsx`
- Modify: `app/[locale]/room/page.tsx`, `messages/*/Room.json`

**Interfaces:**
- Consumes: `ROOM_LIMITS.clipPresets`, `MIN_SNIPPET_DURATION`, `MAX_SNIPPET_DURATION`; artist list from `useGame().artists` (`context/GameContext.tsx`) — verify the provider wraps `/room`; if not, fetch `GET /api/artists` once.
- Produces: `RoomArtistPicker({ value?: string; onChange(name?: string) })` — searchable combobox over catalog artists, "Any artist" clears; no live iTunes discovery. `ClipLengthPicker({ value: number; onChange(v: number) })` — preset chips + "Custom" number input (step 0.1, min/max from constants).

- [ ] **Step 1:** Implement; wire `artistName` and `clipSeconds` into the create request; lobby shows artist and clip length; when fewer songs than rounds, lobby/round header already uses `totalRounds`.
- [ ] **Step 2:** `npm run typecheck` — PASS.
- [ ] **Step 3:** Commit `feat(rooms): artist and clip length in the create form`.

### Task 9: Verification

- [ ] **Step 1:** `npm test` — all pass. `npm run typecheck` — no errors. `npm run build` — succeeds. `git diff --check` clean; `data/beatdrop.db` not staged.
- [ ] **Step 2:** Browser QA (dev server, two browser contexts, desktop + 375 px): both modes, both audio set-ups; custom clip 0.1 s and 15 s actually play that long; artist room; request → approve / decline / expire; host pause → auto-resume at 60 s; audio resumes from the stopped point after pause and after a wrong buzz; refresh during pause; leave confirmation; last player left → results; animations A+B / C with correct colours on both screens; keyboard focus on the pause dialog; reduced motion.
- [ ] **Step 3:** Report per AGENTS.md completion format.
