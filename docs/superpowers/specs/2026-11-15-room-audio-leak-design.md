# Room audio leak — design (short)

## Why
In live rooms every client received the current round's raw preview URL (`RoomView.audioUrl`)
from the countdown on. `/api/autocomplete` returns `previewUrl` for every catalog song, and the
public iTunes Search API returns the same URLs, so a scripted client could match the two and
know the song before the reveal (seen in a browser on `feat/room-upgrades`).

## Goals / non-goals
- Goal: no identifying audio URL reaches a room client before the reveal; audio keeps working
  for both "host" and "everyone" audio set-ups, including Deezer links that need re-signing.
- Goal: autocomplete stops returning `previewUrl` (no client reads it).
- Non-goal: audio fingerprinting (Shazam-style) — inherent to any audio game.
- Non-goal (follow-up): solo rounds and Daily Challenge also send the raw `previewUrl` as
  `audioUrl` (`lib/engine/roundEngine.ts`, `lib/engine/dailyEngine.ts`). Removing it from
  autocomplete closes the easy in-app correlation for them, but the iTunes Search API still
  allows it. They need the same opaque-URL treatment in a separate change.

## Approaches
1. **Opaque, round-scoped room audio route (chosen).** `RoomView.audioUrl` becomes
   `/api/rooms/{code}/audio?round={i}&k={hmac}`. The Node route loads the room, checks the
   HMAC (code, createdAt, startedAt, round) and that the round has started, then streams the
   bytes server-side (Apple direct; Deezer via the existing re-signing resolver). Range
   requests are forwarded so seeking keeps working. Nothing in the URL, headers or redirects
   identifies the song. No storage change: the room store is unchanged, so no Supabase/SQLite
   impact.
2. Encrypt the preview URL into a token handled by the generic proxy. Works without a room
   lookup, but the token is a stable per-song identifier (same song → same token across
   rooms), so it can still be correlated; rejected.
3. Only strip `previewUrl` from autocomplete. Cheap, but the iTunes Search API exposes the
   same URLs; rejected as the sole fix (kept as defence in depth).

## Details / calls made
- HMAC uses the existing room secret (`GAME_TOKEN_SECRET`); `startedAt` is in the MAC so a
  rematch with the same code never hits a cached clip of the previous game.
- Future rounds are refused (404) — no pre-fetching the next round's audio.
- `Cache-Control: private` (per-room URL, not shareable through a CDN).
- Rate-limited per IP like the Deezer proxy.
- `useRoomAudio` drops its own proxy fallback: the server always proxies room audio.
