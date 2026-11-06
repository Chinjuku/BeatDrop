import type { MultipleChoiceOption, Song } from '../../shared/types';

export type ArtistGender = 'male' | 'female';

// Explicitly curated metadata keyed by Apple artist IDs already stored on tracks.
// Unknown artists and groups are intentionally absent; names are never used to infer gender.
export const VERIFIED_ARTIST_GENDER_BY_ID: Readonly<Record<string, ArtistGender>> = {
  '159260351': 'female', // Taylor Swift
  '64387566': 'female', // Katy Perry
  '390647681': 'female', // Sabrina Carpenter
  '979458609': 'female', // Olivia Rodrigo
  '1065981054': 'female', // Billie Eilish
  '412778295': 'female', // Ariana Grande
  '1031397873': 'female', // Dua Lipa
  '1024195544': 'female', // Violette Wautier
  '1085511635': 'female', // Ink Waruntorn
  '1527648726': 'female', // MILLI
  '301261712': 'female', // Palmy
  '1193225731': 'female', // BOWKYLION
  '111051': 'male', // Eminem
  '278873078': 'male', // Bruno Mars
  '183313439': 'male', // Ed Sheeran
  '479756766': 'male', // The Weeknd
  '966309175': 'male', // Post Malone
  '32940': 'male', // Michael Jackson
  '671377502': 'male', // NONT TANONT
  '1525357183': 'male', // Jeff Satur
  '1191438753': 'male', // THE TOYS
  '1477175033': 'male', // Billkin
  '1662974223': 'male', // GUNNER
  '1697337266': 'male', // ILLSLICK
  '1614805714': 'male', // PUN
  '298496035': 'male', // Avicii
};

export function getStableSongArtistId(song: Song): string | null {
  const primaryCredit = song.artists?.find((credit) => credit.role === 'primary');
  const id = song.artistId || primaryCredit?.artistId || song.artistIds?.[0];
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export function getSongArtistGender(song: Song): ArtistGender | null {
  const id = getStableSongArtistId(song);
  return id ? VERIFIED_ARTIST_GENDER_BY_ID[id] || null : null;
}

function normalizedGenre(genre: string): string {
  return genre.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function optionFromSong(song: Song): MultipleChoiceOption {
  return {
    id: song.id,
    title: song.title,
    artistName: song.artistName,
    artworkUrl: song.artworkUrl,
  };
}

/** Selects one answer and three distinct-artist distractors without name parsing. */
export function selectGuesserChoices(candidates: Song[]): {
  answer: Song;
  choices: MultipleChoiceOption[];
} | null {
  const artistGroups = new Map<string, Song[]>();
  for (const song of candidates) {
    const artistId = getStableSongArtistId(song);
    if (!artistId) continue;
    const tracks = artistGroups.get(artistId) || [];
    tracks.push(song);
    artistGroups.set(artistId, tracks);
  }

  const groups = Array.from(artistGroups, ([artistId, tracks]) => ({
    artistId,
    tracks,
    gender: VERIFIED_ARTIST_GENDER_BY_ID[artistId] || null,
  }));
  const viableTargets = groups.flatMap((targetGroup) => {
    const answer = targetGroup.tracks[0];
    const genderMatched = groups.filter((group) =>
      group.artistId !== targetGroup.artistId &&
      (!targetGroup.gender || group.gender === targetGroup.gender)
    );
    if (genderMatched.length < 3) return [];

    const targetGenre = normalizedGenre(answer.genre || '');
    const distractorGroups = genderMatched
      .map((group) => {
        const representative = [...group.tracks].sort((a, b) => {
          const aSameGenre = normalizedGenre(a.genre || '') === targetGenre ? 1 : 0;
          const bSameGenre = normalizedGenre(b.genre || '') === targetGenre ? 1 : 0;
          return bSameGenre - aSameGenre || (b.popularityScore || 0) - (a.popularityScore || 0) || a.id.localeCompare(b.id);
        })[0];
        return { group, representative };
      })
      .sort((a, b) => {
        const aSameGenre = normalizedGenre(a.representative.genre || '') === targetGenre ? 1 : 0;
        const bSameGenre = normalizedGenre(b.representative.genre || '') === targetGenre ? 1 : 0;
        return bSameGenre - aSameGenre ||
          (b.representative.popularityScore || 0) - (a.representative.popularityScore || 0) ||
          a.group.artistId.localeCompare(b.group.artistId);
      })
      .slice(0, 3)
      .map(({ representative }) => representative);
    return [{ answer, choices: [answer, ...distractorGroups].map(optionFromSong) }];
  });

  if (viableTargets.length === 0) return null;
  const selected = viableTargets[Math.floor(Math.random() * viableTargets.length)];
  return {
    answer: selected.answer,
    choices: selected.choices.sort(() => Math.random() - 0.5),
  };
}
