# Artist Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping an artist in Categories → Artists opens a shareable full-page artist view. The
page has tabs, 30 s previews played through an opaque proxy, a mini-player, and a button that
starts the artist quiz.

**Architecture:** Server module `lib/engine/artistPage.ts` builds a preview-URL-free DTO from the
same artist list and song filter that the quiz uses. Audio goes through
`/api/artists/preview?t=<AES token>`. Pure sorting/grouping/shuffle logic lives in
`shared/artistPage.ts` (unit-tested). A client view, plus a hook that owns a single `<audio>`.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query 5, next-intl 4, Tailwind 3,
node:test + tsx.

**Spec:** `docs/superpowers/specs/2026-11-15-artist-page-design.md`

## Global Constraints

- No `previewUrl` / `trackViewUrl` in any client-bound payload from this feature.
- Read collaboration info only from `song.artists` credits. Do not split names.
- `discovered-*` ids: no page; the API returns 404.
- Preview length cap is 30 s. Clock format is `m:ss`.
- Copy lives in the new `ArtistPage` namespace (th + en, identical key trees) plus
  `Metadata.artist`.
- Gates: `npm test`, `npm run typecheck`, `npm run build`.

## Review Focus

1. A song with no `previewUrl` must not appear in the list (the client can't play it). Test this
   in Task 2.
2. An artist whose only songs are collaborations: the ยอดนิยม tab is non-empty and the collabs tab
   is shown. Test this in Task 1 (`availableTabs`).
3. Missing `releaseDate` and `releaseYear` = 0: the latest sort is stable and doesn't throw. Test
   this in Task 1.
4. Navigating away mid-play stops the audio (unmount cleanup). Check this in browser QA in Task 4.
5. Tapping the playing row pauses it, and tapping another row switches songs (one audio element).
   Check this in browser QA in Task 4.

---

### Task 1: Pure artist-page logic

**Files:** Create `shared/artistPage.ts`; Test: `tests/artist-page.test.ts`

**Produces:**
- `type ArtistPageTab = 'popular' | 'latest' | 'albums' | 'collabs'`
- `interface ArtistPageSong { id; title; artistName; albumName; releaseYear: number; releaseDate?: string; artworkUrl; popularityScore: number; isCollab: boolean; audioUrl: string }`
- `interface ArtistPageArtist { id; name; category: 'thai'|'international'; mainGenre; avatarUrl; trackCount: number }`
- `interface ArtistPageData { artist: ArtistPageArtist; songs: ArtistPageSong[] }`
- `dedupeArtistSongs<T extends {title; artistName; popularityScore}>(songs: T[]): T[]`
- `sortPopular(songs)`, `sortLatest(songs)`: return new arrays
- `groupByAlbum(songs): { album: string; year: number; songs: ArtistPageSong[] }[]`
- `availableTabs(songs): ArtistPageTab[]`
- `shuffleOrder<T>(items: T[], random?: () => number): T[]`
- `formatClock(seconds: number): string`

- [ ] Tests:
  - `formatClock(0)==='0:00'`, `formatClock(7.9)==='0:07'`, `formatClock(30)==='0:30'`,
    `formatClock(NaN)==='0:00'`.
  - The popular sort is score desc, then newer first.
  - The latest sort uses releaseDate over releaseYear; missing data goes last without throwing.
  - Albums are grouped newest first.
  - The collabs tab appears only when some song has `isCollab`.
  - Dedupe keeps the higher score per title + artist (case/space-insensitive).
  - The shuffle with a seeded RNG is a permutation and doesn't mutate its input.
- [ ] Run `node --import tsx/esm --test tests/artist-page.test.ts`; it fails (module missing).
- [ ] Implement it. Run again; it passes.
- [ ] Commit.

### Task 2: Server data + API + preview proxy

**Files:**
- Modify `lib/engine/songPool.ts`: add `loadArtistSongsFromCloud`, verbatim from PR #15.
- Modify `lib/engine/artistRoutes.ts`: extract `getMergedArtists(): Promise<Artist[]>`, used by
  `handleGetArtists`.
- Modify `lib/engine/audioToken.ts`: add `artistPreviewPath(url)` (TTL 2 h).
- Create `lib/engine/artistPage.ts`:
  - `getArtistPageData(id: string): Promise<ArtistPageData | null>`
  - `toArtistPageSong(song: Song, artistKey): ArtistPageSong | null`
- Modify `app/api/artists/[id]/route.ts`: add GET.
- Create `app/api/artists/preview/route.ts`.
- Test: `tests/artist-page-api.test.ts` (SQLite temp-copy pattern from `daily-archive.test.ts`).

- [ ] Tests:
  - GET `/api/artists/th-bodyslam` returns 200 with songs. The JSON contains no `previewUrl`, no
    `trackViewUrl`, and no `mzstatic`/`dzcdn` audio host.
  - Every `audioUrl` matches `^/api/artists/preview\?t=ba1\.`, and `verifyAudioToken` decodes it
    to the song's real preview URL.
  - The `discovered-abc` id and an unknown id both return 404.
  - A pool song without `previewUrl` is excluded.
  - The preview route returns 404 for a bad token.
- [ ] Run; it fails. Implement. Run; it passes. Run `npm run typecheck`. Commit.

### Task 3: i18n + page + player hook + categories link

**Files:**
- Create `messages/{th,en}/ArtistPage.json`.
- Add `ArtistPage` to `i18n/namespaces.ts`.
- Add `Metadata.artist` and the `'artist'` page key in `buildPageMetadata`.
- Create `hooks/useArtistPreviewPlayer.ts`.
- Create `components/artist/ArtistPageView.tsx`.
- Create `app/[locale]/categories/artist/[id]/page.tsx`.
- Modify `app/[locale]/categories/page.tsx`: cards link to the page, except `discovered-*`.

**Consumes:** Task 1 helpers and types; `GET /api/artists/[id]`.

- [ ] Hook `useArtistPreviewPlayer()` returns
  `{ currentId: string|null; isPlaying; elapsed; loadingId; errorId; shuffle: boolean; toggle(song), playShuffle(songs), next(), stop() }`.
  - It stops at 30 s.
  - On ended/30 s in shuffle mode it advances; otherwise it stops.
  - Cleanup on unmount.
- [ ] The view follows the spec layout and states. Run `npm run test:i18n`, which passes.
- [ ] Run `npm run typecheck` and `npm run build`. Commit.

### Task 4: QA + PR

- [ ] Run `npm test`, `npm run typecheck` and `npm run build`. Record the outcomes.
- [ ] Browser QA (dev server):
  - Mobile at 375 and desktop.
  - Tabs, including keyboard arrows.
  - Row play/pause and switching rows.
  - Shuffle and next.
  - The mini-player clock.
  - The back link.
  - เริ่มทายเพลง starts the artist quiz.
  - 404 artist.
  - The audio request URL is opaque.
  - Leaving the page stops audio.
- [ ] Push the branch and open a PR against `main`, noting the PR #15 overlap.
