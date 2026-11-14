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
- Goal (added): solo rounds, Daily Challenge and Daily practice get the same protection.
  `/api/daily` also sent all five rounds' preview URLs up front; rounds not yet reached now
  carry no audio at all (otherwise a player could listen before the round's timer starts).

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

## Solo / Daily / practice
- These have no shared room state, and must work on any serverless instance, so the audio link
  is a stateless encrypted token: `/api/round/audio?t=ba1.<iv>.<ciphertext>.<tag>`
  (AES-256-GCM, random IV, key domain-separated from the round token, 6 h expiry). The same
  song never yields the same URL, so tokens cannot be matched across players or rounds.
- Daily: only the current round (and finished ones) carry an audio link; the client's
  next-round prefetch is skipped as a result (small extra load time per round, by design).
- After the reveal the client still plays `reveal.previewUrl` via the existing proxy; the song
  is public at that point.
