/**
 * Artist page pure logic: tab sorting, album grouping, collab tab visibility, dedupe,
 * shuffle and the mini-player clock.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  availableTabs,
  dedupeArtistSongs,
  formatClock,
  groupByAlbum,
  shuffleOrder,
  sortLatest,
  sortPopular,
  type ArtistPageSong,
} from '../shared/artistPage';

function song(partial: Partial<ArtistPageSong> & { id: string }): ArtistPageSong {
  return {
    title: partial.id,
    artistName: 'Bodyslam',
    albumName: 'Believe',
    releaseYear: 2014,
    artworkUrl: '',
    popularityScore: 50,
    isCollab: false,
    audioUrl: `/api/artists/preview?t=${partial.id}`,
    ...partial,
  };
}

describe('formatClock', () => {
  it('formats whole seconds as m:ss', () => {
    assert.equal(formatClock(0), '0:00');
    assert.equal(formatClock(7.9), '0:07');
    assert.equal(formatClock(30), '0:30');
    assert.equal(formatClock(75), '1:15');
  });
  it('treats invalid input as zero', () => {
    assert.equal(formatClock(Number.NaN), '0:00');
    assert.equal(formatClock(-3), '0:00');
    assert.equal(formatClock(Number.POSITIVE_INFINITY), '0:00');
  });
});

describe('sortPopular', () => {
  it('orders by popularity, then newer release, then title', () => {
    const out = sortPopular([
      song({ id: 'a', popularityScore: 40 }),
      song({ id: 'b', popularityScore: 90, releaseYear: 2010 }),
      song({ id: 'c', popularityScore: 90, releaseYear: 2020 }),
      song({ id: 'd', popularityScore: 90, releaseYear: 2020, title: 'Aardvark' }),
    ]);
    assert.deepEqual(out.map((s) => s.id), ['d', 'c', 'b', 'a']);
  });
  it('does not mutate its input', () => {
    const input = [song({ id: 'a', popularityScore: 1 }), song({ id: 'b', popularityScore: 2 })];
    sortPopular(input);
    assert.deepEqual(input.map((s) => s.id), ['a', 'b']);
  });
});

describe('sortLatest', () => {
  it('prefers releaseDate over releaseYear and puts undated songs last', () => {
    const out = sortLatest([
      song({ id: 'undated', releaseYear: 0 }),
      song({ id: 'y2019', releaseYear: 2019 }),
      song({ id: 'mar2020', releaseYear: 2020, releaseDate: '2020-03-01T00:00:00Z' }),
      song({ id: 'nov2020', releaseYear: 2020, releaseDate: '2020-11-01T00:00:00Z' }),
      song({ id: 'bad-date', releaseYear: 2018, releaseDate: 'not a date' }),
    ]);
    assert.deepEqual(out.map((s) => s.id), ['nov2020', 'mar2020', 'y2019', 'bad-date', 'undated']);
  });
});

describe('groupByAlbum', () => {
  it('groups by album, newest album first, keeping input order inside an album', () => {
    const groups = groupByAlbum([
      song({ id: 'k1', albumName: 'Kingkongkoi', releaseYear: 2008 }),
      song({ id: 'b1', albumName: 'Believe', releaseYear: 2014 }),
      song({ id: 'k2', albumName: 'Kingkongkoi', releaseYear: 2008 }),
      song({ id: 'b2', albumName: 'Believe', releaseYear: 2014 }),
    ]);
    assert.deepEqual(
      groups.map((g) => [g.album, g.year, g.songs.map((s) => s.id)]),
      [
        ['Believe', 2014, ['b1', 'b2']],
        ['Kingkongkoi', 2008, ['k1', 'k2']],
      ]
    );
  });
  it('gives songs without an album their own bucket', () => {
    const groups = groupByAlbum([song({ id: 'x', albumName: '' })]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].album, '');
  });
});

describe('availableTabs', () => {
  it('hides the collabs tab when no song is a collaboration', () => {
    assert.deepEqual(availableTabs([song({ id: 'a' })]), ['popular', 'latest', 'albums']);
  });
  it('shows the collabs tab when some song is a collaboration', () => {
    assert.deepEqual(availableTabs([song({ id: 'a', isCollab: true })]), ['popular', 'latest', 'albums', 'collabs']);
  });
  it('returns no tabs for an empty catalog', () => {
    assert.deepEqual(availableTabs([]), []);
  });
});

describe('dedupeArtistSongs', () => {
  it('keeps one song per title+artist, preferring the higher popularity', () => {
    const out = dedupeArtistSongs([
      song({ id: 'single', title: 'คิดฮอด', popularityScore: 40 }),
      song({ id: 'album', title: '  คิดฮอด ', popularityScore: 80 }),
      song({ id: 'other', title: 'ยาพิษ', popularityScore: 10 }),
    ]);
    assert.deepEqual(out.map((s) => s.id).sort(), ['album', 'other']);
  });
  it('is case-insensitive on titles', () => {
    const out = dedupeArtistSongs([
      song({ id: 'a', title: 'Shape Of You', popularityScore: 10 }),
      song({ id: 'b', title: 'shape of you', popularityScore: 5 }),
    ]);
    assert.deepEqual(out.map((s) => s.id), ['a']);
  });
});

describe('shuffleOrder', () => {
  it('returns a permutation without mutating the input', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    let seed = 42;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const out = shuffleOrder(input, random);
    assert.deepEqual(input, ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual([...out].sort(), input);
    assert.notDeepEqual(out, input);
  });
  it('handles empty and single-item lists', () => {
    assert.deepEqual(shuffleOrder([]), []);
    assert.deepEqual(shuffleOrder(['x']), ['x']);
  });
});
