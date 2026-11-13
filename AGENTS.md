# BeatDrop — Agent Instructions

> Canonical project instructions for Codex, Antigravity, and other coding agents.
> Claude Code loads this file through `CLAUDE.md`.

## 1. Product context

BeatDrop is a Thai/International music snippet guessing game built as a Next.js 15 App Router full-stack application.

Core capabilities:
- Game modes: Default/Reels, Song Guesser, Daily Challenge, Artist Mode, Genre/Year/Era modes.
- Audio previews sourced from the public Apple iTunes Search/Lookup API.
- Cloud data: Supabase PostgreSQL accessed through project-owned server-side REST/database helpers.
- Local/offline development mode: SQLite (`data/beatdrop.db`).
- Hosting: Vercel Serverless.
- Optional caching/rate limiting: Upstash Redis.
- Daily Challenge and leaderboard are competitive features; fairness and server-side validation are mandatory.

Treat the checked-out repository and its current branch as the source of truth. README descriptions can be stale; verify implementation before relying on them.

## 2. Repository map

Known top-level areas (verify before editing; do not invent missing paths):

- `app/` — Next.js App Router pages and Route Handlers.
- `components/` — reusable UI components.
- `context/` — React application/game state.
- `hooks/` — client hooks, including audio/gameplay hooks.
- `lib/` — server/domain logic, catalog, iTunes, engine, database helpers.
- `shared/` — shared configuration and utilities.
- `types/` — TypeScript types.
- `public/` — static assets.
- `scripts/` — maintenance and migration scripts.
- `supabase/` — SQL schema and database-related assets.
- `data/beatdrop.db` — SQLite offline catalog; treat as valuable data, not a disposable build artifact.

Before changing architecture, inspect the actual tree and the nearest `AGENTS.md` / `CLAUDE.md`.

## 3. Non-negotiable engineering rules

### Safety and scope
1. Read `git status --short`, current branch, and recent commits before editing.
2. Preserve unrelated user changes. Never reset, clean, or overwrite user work.
3. Work on the requested feature branch. Do not merge, push, or deploy production unless explicitly authorized.
4. Never expose, print, commit, or place secrets in source, logs, screenshots, or reports.
5. Never run destructive database operations against production.
6. Never delete, regenerate, or replace `data/beatdrop.db` without an explicit backup and approval.
7. Do not silently change product behavior, scoring rules, time presets, or challenge rules. Document and test behavior changes.

### Architecture
1. Keep domain logic out of React presentation components.
2. Keep server-only modules and secrets out of client bundles. Use `server-only` boundaries where appropriate and follow existing project conventions.
3. Use the existing database abstraction and support both Supabase Cloud and SQLite Offline Mode unless a task explicitly changes that contract.
4. Avoid importing server-only modules into Client Components.
5. Prefer small, reversible changes over broad rewrites.
6. Do not introduce a new dependency when existing platform APIs or dependencies are sufficient.
7. Avoid duplicate sources of truth for game timing, scoring, artist identity, and challenge configuration.

### TypeScript and React
1. Preserve strict typing; do not add `any` to bypass a design problem.
2. Validate external API responses and untrusted request bodies at runtime.
3. Keep React state minimal and derived values computed from canonical state.
4. Prevent duplicate effects, event handlers, requests, and round initialization.
5. Clean up timers, audio nodes, media elements, subscriptions, and event listeners.
6. Use semantic HTML, keyboard-accessible controls, and clear loading/empty/error states.

### Data and API
1. Use stable IDs for tracks and artists; never rely on display-name parsing as identity.
2. Model collaborations as a track-to-artist many-to-many relationship when supported by source data.
3. Make sync/upsert jobs idempotent and safe under retries and concurrent execution.
4. GET handlers must be read-only. Mutations belong in appropriate methods and require authorization.
5. Validate authorization on the server; never trust client-provided user IDs, scores, elapsed times, or admin flags.
6. Add or modify indexes/constraints only with migration and rollback considerations.
7. Keep Cloud and SQLite behavior consistent, or explicitly document a supported difference.

## 4. Product invariants

### Artist and track catalog
- A track is a unique recording/catalog item; multiple artists may be associated with one track.
- A collaboration must not be duplicated just because it appears in multiple artist searches.
- Do not split artist display strings on `&`, comma, `feat.`, or `x` as a substitute for authoritative artist metadata.
- Artist Mode should include tracks linked to that artist, including collaborations when the data model supports it.

### Gameplay timing and audio
- Centralize timing constants/configuration; UI controls and actual audio playback must agree.
- Current product requirement: custom snippet bounds are 0.1–15 seconds; Standard preset is 0.5–15 seconds.
- Songspot preset remains its own preset and must not be accidentally overwritten by Standard.
- Convert seconds to milliseconds exactly once at the audio boundary.
- Test actual playback duration, not only displayed slider values.

### Daily Challenge
- Same challenge date must resolve to the same challenge seed, track sequence, round count, and rules for all players.
- Use the product's declared timezone consistently (currently documented as Asia/Bangkok / UTC+7); verify actual implementation before changing.
- Daily Challenge clip stages are fixed server-side to the Standard preset via `DAILY_TIME_STAGES` (shared/types.ts); client-supplied stages are ignored. Do not duplicate hardcoded values.
- Score calculation and validation must be authoritative on the server.
- Duplicate submissions must not award points more than once.
- Leaderboard ordering and tie-breakers must be deterministic.
- Preserve historical challenge and leaderboard data during migrations.

### Offline mode
- SQLite Offline Mode is a supported product path, not a fallback to casually remove.
- Do not claim full offline audio playback unless audio is actually stored and available locally.
- Distinguish offline app shell, offline catalog access, and offline audio availability.

## 5. Workflow for every task

1. **Understand** — inspect relevant source, callers, types, tests, schemas, and current behavior.
2. **Plan** — state the root cause hypothesis, scope, risks, and acceptance criteria.
3. **Reproduce** — add or run a failing test or a minimal reproducible check before fixing when feasible.
4. **Implement** — make the smallest complete change; keep cloud/offline parity.
5. **Verify** — run the commands that actually exist in `package.json`, plus targeted tests.
6. **Review** — inspect `git diff`, check secrets, accidental DB changes, route regressions, and accessibility.
7. **Report** — list files changed, behavior changed, commands run and outcomes, remaining risks, and Preview URL if deployed.

Do not claim a test passed unless it was actually run. Do not claim browser QA if only static code inspection was performed.

## 6. Commands

Known scripts from the repository package manifest:
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run typecheck`
- `npm run migrate:supabase`

Do not assume `lint`, `test`, or `test:e2e` scripts exist. Inspect `package.json` before invoking them. If tests are absent, propose and add an appropriate test setup only when in scope.

## 7. Required quality gates

At minimum, for application changes:
- `npm run typecheck`
- `npm run build`

For database changes:
- Validate SQL/migrations and constraints.
- Test both Supabase and SQLite paths where applicable.
- Verify migration safety and backup/rollback plan.

For UI changes:
- Test desktop and mobile breakpoints.
- Test keyboard focus and navigation.
- Verify loading, error, and empty states.

For gameplay changes:
- Test all affected modes, timing boundaries, score edge cases, refresh/resume, and duplicate submissions.

## 8. Skills

Use the relevant skill before substantial work:
- `.agents/skills/beatdrop-architecture/SKILL.md`
- `.agents/skills/nextjs-app-router/SKILL.md`
- `.agents/skills/artist-catalog-sync/SKILL.md`
- `.agents/skills/daily-challenge/SKILL.md`
- `.agents/skills/audio-gameplay/SKILL.md`
- `.agents/skills/pwa-offline/SKILL.md`
- `.agents/skills/preview-release-qa/SKILL.md`

For Claude Code, matching skills are exposed under `.claude/skills/` (symlinked to `.agents/skills/`).

## 9. Completion report format

Always finish with:
- **Summary**
- **Root cause / design decision**
- **Files changed**
- **Tests and commands** (exact results)
- **Database / migration impact**
- **Security and performance impact**
- **Unresolved risks**
- **Deployment status** (never imply production deployment without proof)
