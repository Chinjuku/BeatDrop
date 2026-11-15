/**
 * Artist page: the client-facing shapes and the pure list logic behind its tabs.
 *
 * `ArtistPageSong` deliberately has no preview or store link: audio goes through an opaque,
 * expiring `/api/artists/preview?t=` token so a page listing can never be matched against a
 * round's audio URL.
 */

export type ArtistPageTab = 'popular' | 'latest' | 'albums' | 'collabs';

export const ARTIST_PAGE_TABS: readonly ArtistPageTab[] = ['popular', 'latest', 'albums', 'collabs'];

/** Previews are 30 s clips; the player stops here even if the file runs longer. */
export const ARTIST_PREVIEW_SECONDS = 30;

export interface ArtistPageArtist {
  id: string;
  name: string;
  category: 'thai' | 'international';
  mainGenre: string;
  avatarUrl: string;
  trackCount: number;
}

export interface ArtistPageSong {
  id: string;
  title: string;
  artistName: string;
  albumName: string;
  releaseYear: number;
  releaseDate?: string;
  artworkUrl: string;
  popularityScore: number;
  /** More than one distinct artist is credited on the track (from track–artist credits). */
  isCollab: boolean;
  /** Same-origin opaque preview path. */
  audioUrl: string;
}

export interface ArtistPageData {
  artist: ArtistPageArtist;
  songs: ArtistPageSong[];
}

export interface AlbumGroup {
  album: string;
  year: number;
  songs: ArtistPageSong[];
}

function releaseTime(s: Pick<ArtistPageSong, 'releaseDate' | 'releaseYear'>): number {
  if (s.releaseDate) {
    const t = Date.parse(s.releaseDate);
    if (Number.isFinite(t)) return t;
  }
  if (Number.isFinite(s.releaseYear) && s.releaseYear > 0) return Date.UTC(s.releaseYear, 0, 1);
  return Number.NEGATIVE_INFINITY;
}

function byTitle(a: ArtistPageSong, b: ArtistPageSong): number {
  return a.title.localeCompare(b.title);
}

export function sortPopular(songs: readonly ArtistPageSong[]): ArtistPageSong[] {
  return [...songs].sort(
    (a, b) => b.popularityScore - a.popularityScore || releaseTime(b) - releaseTime(a) || byTitle(a, b)
  );
}

export function sortLatest(songs: readonly ArtistPageSong[]): ArtistPageSong[] {
  return [...songs].sort((a, b) => {
    const ta = releaseTime(a);
    const tb = releaseTime(b);
    if (ta === tb) return byTitle(a, b);
    if (ta === Number.NEGATIVE_INFINITY) return 1;
    if (tb === Number.NEGATIVE_INFINITY) return -1;
    return tb - ta;
  });
}

/** Albums newest first; songs keep their input order within an album. */
export function groupByAlbum(songs: readonly ArtistPageSong[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup & { latest: number }>();
  for (const s of songs) {
    const album = s.albumName.trim();
    const key = album.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { album, year: s.releaseYear || 0, songs: [], latest: Number.NEGATIVE_INFINITY };
      groups.set(key, g);
    }
    g.songs.push(s);
    g.year = Math.max(g.year, s.releaseYear || 0);
    g.latest = Math.max(g.latest, releaseTime(s));
  }
  return Array.from(groups.values())
    .sort((a, b) => (a.latest === b.latest ? a.album.localeCompare(b.album) : b.latest - a.latest))
    .map(({ album, year, songs: list }) => ({ album, year, songs: list }));
}

export function availableTabs(songs: readonly ArtistPageSong[]): ArtistPageTab[] {
  if (songs.length === 0) return [];
  return ARTIST_PAGE_TABS.filter((tab) => tab !== 'collabs' || songs.some((s) => s.isCollab));
}

function titleKey(title: string, artistName: string): string {
  const norm = (v: string) => v.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${norm(title)}::${norm(artistName)}`;
}

/** One entry per title + credited artist string (single vs album releases), most popular wins. */
export function dedupeArtistSongs<T extends { title: string; artistName: string; popularityScore: number }>(
  songs: readonly T[]
): T[] {
  const best = new Map<string, T>();
  for (const s of songs) {
    const key = titleKey(s.title, s.artistName);
    const prev = best.get(key);
    if (!prev || s.popularityScore > prev.popularityScore) best.set(key, s);
  }
  return Array.from(best.values());
}

/** Fisher–Yates on a copy. */
export function shuffleOrder<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
