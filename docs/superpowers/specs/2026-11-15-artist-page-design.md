# Artist page (design "B") — design

Status: approved by the user (2026-11-15, "อนุมัติ ลุยเลย").

## Intent

Today, tapping an artist card in Categories → Artists launches an artist quiz immediately. Players
can't see which songs an artist has, or hear them, before they commit to a quiz. The artist page
lets them browse an artist's catalog, listen to 30 s previews, and then start the quiz on purpose.
It also gives each artist a shareable URL.

## Goals

- Tapping an artist card opens `/[locale]/categories/artist/[id]` (Thai: `/categories/artist/<id>`,
  English: `/en/categories/artist/<id>`).
- Page content: a back link to all artists; a hero (avatar, name, Thai/International, genre, song
  count); a primary **เริ่มทายเพลง** button that starts the same artist quiz as today; a secondary
  **เล่นสุ่ม** button that shuffle-plays previews.
- Tabs: ยอดนิยม / ล่าสุด / อัลบั้ม / เพลงร่วมงาน. The collaborations tab is hidden when the
  artist has none.
- Song rows: track number, artwork, title, album · year, and a play/pause button for the 30 s
  preview.
- A sticky mini-player at the bottom: title, play/pause, elapsed / 0:30. In shuffle mode it also
  has a "next" button.
- Works on mobile and desktop. Keyboard and a11y work. Loading, empty and error states exist. Copy
  is in th and en.

## Non-goals

- No search inside the artist page (mockup B has none).
- No offline audio. Offline / SQLite mode still loads the song list from the local catalog;
  playback needs the network, and each row shows an error if the clip can't load.
- No pages for `discovered-*` artists (live iTunes search results get a random id each time).
  Tapping one of those still launches the quiz directly, as today.
- No changes to scoring, timing presets or Daily rules.

## Anti-goals

- Never send a raw `previewUrl` (or `trackViewUrl`) to the client. PR #13 closed the URL-matching
  cheat, and this page must not reopen it.
- Never split display names on `&` / `feat.` / `x` in this feature. Use the existing track–artist
  credits (`song.artists`, roles primary / featured / collaborator).

## Constraints and findings

- Artist ids: curated `th-*` / `intl-*` and custom `artist_*` ids are stable. `discovered-*` ids
  are random (see non-goals).
- Popularity: there are no real play counts. `popularityScore` comes from the iTunes search
  order at ingest time (defaults to 50). The ยอดนิยม sort uses it, with ties broken by newest
  release, then title.
- Collaborations: SQLite has `track_artists`. Production Supabase has no such table (see the
  PR #15 notes), so cloud songs get credits from the existing `parseTrackArtistCredits` (which
  has a protected-band list). Artist Mode already uses the same credits. This feature only
  *reads* `song.artists`.
- Full cloud catalog: PR #15 (open) adds `loadArtistSongsFromCloud` to `lib/engine/songPool.ts`.
  This branch carries that same function verbatim, so the two merge cleanly in either order, and
  the artist page calls it.
- Audio: the round audio token (`lib/engine/audioToken.ts`) is AES-GCM with a random IV, so a
  song never yields the same URL twice. The artist page uses the same tokens, served by its own
  route with its own rate limit.
  - Residual risk (unchanged by this feature): the bytes are Apple's public preview, so a script
    could compare audio content against the public iTunes API. URL matching stays closed.

## Approaches considered

1. **Full-page route by stable id with a server JSON API + token-proxied audio (chosen).** The
   URL is shareable, the songs come from the same filter the quiz uses, and no raw URLs leave the
   server.
2. Route by artist name (`/categories/artist/Bodyslam`). This also works for discovered artists,
   but names aren't identity (renames, case, Thai/English spellings), and the project rules say
   to use stable ids.
3. Bottom sheet (option A). The user picked B.

## Design

### Server

- `lib/engine/artistPage.ts` (server-only):
  - `resolveArtistById(id)`: looks the id up in the same merged artist list `/api/artists`
    returns (`getAllArtists(songPool)` + cached Supabase artists). The merge is factored out of
    `handleGetArtists` into `getMergedArtists()` so there's one source of truth.
  - `getArtistPageData(id)`: resolve the artist, then `ensureCatalogLoaded()` +
    `await loadArtistSongsFromCloud(name)`, then filter `songPool` with `matchesArtistFilter`
    (the quiz filter) and `!isJunkTrack`, also falling back to SQLite
    `dbService.searchSongs(name, { artist })` when the pool has nothing (the same fallback
    roundEngine uses). Map each song to an `ArtistPageSong` DTO with
    `audioUrl = artistPreviewPath(previewUrl)`. Songs with no preview are dropped.
- `ArtistPageSong` (shared type): `id, title, artistName, albumName, releaseYear, releaseDate?,
  artworkUrl, popularityScore, isCollab, audioUrl`. `isCollab` = more than one distinct credited
  artist in `song.artists`.
- `GET /api/artists/[id]`: read-only, uses the default API rate limit. Returns
  `{ code: 0, data: { artist, songs } }`, or a 404 when the id is unknown or starts with
  `discovered-`.
- `GET /api/artists/preview?t=`: verifies the token, applies a per-IP limit
  (`rl_artist_preview`, 120/min), then `streamPreview(..., 'private, max-age=3600')`.
  `artistPreviewPath()` lives next to `roundAudioPath()` (TTL 2 h).

### Shared pure logic (`shared/artistPage.ts`, unit-tested)

- `dedupeArtistSongs`: keeps one song per normalized title + artist, preferring higher
  popularity.
- `sortPopular` / `sortLatest` (releaseDate, falling back to releaseYear, ties by title).
- `groupByAlbum`: albums ordered newest first; within an album, songs in input (popular) order.
- `collabSongs`.
- `availableTabs`: drops the collabs tab when there are none.
- `shuffleOrder(ids, random)`: Fisher–Yates with an injectable RNG.
- `formatClock(seconds)`: `0:07`.

### Client

- `app/[locale]/categories/artist/[id]/page.tsx`: a server wrapper (`setRequestLocale`,
  metadata from `Metadata.artist`) that renders `ArtistPageView` (client).
- `components/artist/ArtistPageView.tsx`: fetches with TanStack Query
  (`['artist-page', id]`). Renders a skeleton, not-found (404), an error with retry, and an empty
  state.
- `hooks/useArtistPreviewPlayer.ts`: owns one `HTMLAudioElement`. Plays one song at a time and
  stops at 30 s or on `ended`. In shuffle mode it advances through a queue. Cleans up on unmount
  (pause, `src=''`, remove listeners). Exposes
  `{ currentId, isPlaying, elapsed, error, toggle(id), playQueue(ids), next(), stop() }`.
- เริ่มทายเพลง: stops audio, then
  `handleConfigChange({...config, mode:'standard', genreFilter:'any', yearFilter:'any',
  artistName: artist.name, category: artist.category}, true)` → `/play`.
  - Behavior note: the category is the artist's own category. Before, it was the grid's filter,
    or the current config when the filter was "all".
- Categories grid: a non-discovered card links to the artist page; a `discovered-*` card keeps
  launching the quiz.
- Layout: mobile follows mockup B. On desktop (`lg`), the hero and CTAs sit in a sticky left
  column (~320 px) with the list on the right. The mini-player is fixed at the bottom, with width
  limited to the page container.
- a11y:
  - Tabs use the `tablist` / `tab` / `tabpanel` pattern with arrow-key navigation.
  - Row buttons have `aria-label` "เล่น/หยุด <title>" and `aria-pressed`.
  - The mini-player is a `region` with an `aria-live="polite"` title.
  - Focus rings are visible.
- i18n: a new `ArtistPage` namespace (th/en) plus `Metadata.artist`.

## Left to the builder

Exact spacing and colours, within the existing `--song-*` CSS variables. The skeleton row count.
