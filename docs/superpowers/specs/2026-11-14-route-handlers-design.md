# Remove the Express bridge (short design)

Date: 2026-11-14 · Branch: `refactor/route-handlers`

## Intent
Every API request currently goes through `lib/expressBridge.ts`, which fakes an Express
request/response around the whole `lib/catalogEngine.ts` Express app. This bundles Express +
cors into every serverless function, hides which path maps to which handler, and blocks
clean new APIs (live rooms come next). Remove it before building rooms.

## Goals
- Each API path is an explicit Next Route Handler that calls one engine handler.
- Same paths, methods, JSON shapes, status codes, `Set-Cookie` and `X-RateLimit-*` headers.
- Cloud (Supabase) and SQLite behave as before.
- Contract tests (built-in `node:test`, no new dependency) that pass before and after.
- Drop `express`, `cors`, `@types/express`, `@types/cors`.

## Non-goals
- Player identity / accounts (moved to the live-rooms design).
- Changing scoring, timing or Daily Challenge rules.

## Approaches
1. **Rewrite every handler to return `Response`.** Cleanest end state, but touches ~120 lines
   of handler logic plus every `verify-*` script that mocks req/res. High churn, high risk.
2. **Keep the handlers' `(req, res)` shape with project-owned minimal types**, plus one small
   `runApiHandler()` that turns a Web `Request` into that shape and the result into a
   `Response`. No routing or middleware layer. Small and reversible; existing scripts keep working.
3. Keep Express. Rejected: it is the debt being removed.

Chosen: **2** (my call). Handlers can move to approach 1 one at a time later.

## Design
- `lib/http/api.ts`: `ApiRequest` / `ApiResponse` types, `runApiHandler(req, handler, opts)`
  (parses query/body/headers/ip, ensures the catalog is loaded, applies rate limits and
  admin bypass, collects status/headers/body).
- Rate limiters become `{ windowMs, maxRequests, prefix, message }` configs consumed by
  `runApiHandler`; `verifyRateLimit` (Upstash + in-memory) is unchanged.
- Admin guard and `/api/admin/verify` become plain functions.
- Route files: `/api/songs`, `/api/autocomplete`, `/api/admin/verify`, `/api/artists/[id]`,
  `/api/songspot/{round,search,guess,skip}` (legacy aliases kept), and the existing ones rewired.
- Delete `app/api/[...slug]`, `lib/expressBridge.ts`, `lib/catalogEngine.ts`.
- CORS: the app only calls its own origin; Route Handlers send no CORS headers, so
  cross-origin browser reads stay blocked (same effect as the production allow-list for
  foreign origins). `OPTIONS` handling is dropped.

## Also in this change
- Fix: autocomplete finds nothing for "bodyslam".
- Fix: Skip then Give up records two skips.
- Add `app/global-error.tsx`; make `app/not-found.tsx` follow the locale.
