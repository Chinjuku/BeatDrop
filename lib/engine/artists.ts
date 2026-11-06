import fs from 'node:fs';
import path from 'node:path';
import { Artist, ArtistRole, CategoryType, Song, TrackArtistCredit } from '../../shared/types';
import { dbService } from '../db';
import { checkArtistStrictMatch, isJunkTrack } from '../itunes';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CUSTOM_ARTISTS_FILE = path.join(DATA_DIR, 'custom-artists.json');

if (!process.env.VERCEL && !fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

export const CURATED_ARTISTS: Artist[] = [
  // Thai Artists
  { id: 'th-bodyslam', name: 'Bodyslam', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-tillybirds', name: 'Tilly Birds', category: 'thai', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'th-threemandown', name: 'Three Man Down', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-cocktail', name: 'Cocktail', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-bowkylion', name: 'BOWKYLION', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-nonttanont', name: 'NONT TANONT', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-potato', name: 'Potato', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-slotmachine', name: 'Slot Machine', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-jeffsatur', name: 'Jeff Satur', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-milli', name: 'MILLI', category: 'thai', mainGenre: 'Hip-Hop/Rap', avatarUrl: '' },
  { id: 'th-tattoocolour', name: 'Tattoo Colour', category: 'thai', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'th-polycat', name: 'Polycat', category: 'thai', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'th-inkwaruntorn', name: 'Ink Waruntorn', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-palmy', name: 'PALMY', category: 'thai', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'th-4eve', name: '4EVE', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-billkin', name: 'Billkin', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-fellowfellow', name: 'Fellow Fellow', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-violette', name: 'Violette Wautier', category: 'thai', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'th-illslick', name: 'Illslick', category: 'thai', mainGenre: 'Hip-Hop/Rap', avatarUrl: '' },
  { id: 'th-purpeech', name: 'PURPEECH', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-safeplanet', name: 'Safeplanet', category: 'thai', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'th-carabao', name: 'Carabao', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-bigass', name: 'Big Ass', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'th-thetoys', name: 'THE TOYS', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-pun', name: 'PUN', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-gunner', name: 'GUNNER', category: 'thai', mainGenre: 'Hip-Hop/Rap', avatarUrl: '' },
  { id: 'th-stamp', name: 'Stamp', category: 'thai', mainGenre: 'T-Pop', avatarUrl: '' },
  { id: 'th-taitosmith', name: 'TaitosmitH', category: 'thai', mainGenre: 'Rock', avatarUrl: '' },

  // International Artists
  { id: 'intl-queen', name: 'Queen', category: 'international', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'intl-taylorswift', name: 'Taylor Swift', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-brunomars', name: 'Bruno Mars', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-coldplay', name: 'Coldplay', category: 'international', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'intl-theweeknd', name: 'The Weeknd', category: 'international', mainGenre: 'R&B', avatarUrl: '' },
  { id: 'intl-edsheeran', name: 'Ed Sheeran', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-eminem', name: 'Eminem', category: 'international', mainGenre: 'Hip-Hop/Rap', avatarUrl: '' },
  { id: 'intl-billieeilish', name: 'Billie Eilish', category: 'international', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'intl-arianagrande', name: 'Ariana Grande', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-michaeljackson', name: 'Michael Jackson', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-linkinpark', name: 'LINKIN PARK', category: 'international', mainGenre: 'Rock', avatarUrl: '' },
  { id: 'intl-dualipa', name: 'Dua Lipa', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-oliviarodrigo', name: 'Olivia Rodrigo', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-bts', name: 'BTS', category: 'international', mainGenre: 'K-Pop', avatarUrl: '' },
  { id: 'intl-blackpink', name: 'BLACKPINK', category: 'international', mainGenre: 'K-Pop', avatarUrl: '' },
  { id: 'intl-newjeans', name: 'NewJeans', category: 'international', mainGenre: 'K-Pop', avatarUrl: '' },
  { id: 'intl-arcticmonkeys', name: 'Arctic Monkeys', category: 'international', mainGenre: 'Indie', avatarUrl: '' },
  { id: 'intl-sabrinacarpenter', name: 'Sabrina Carpenter', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
  { id: 'intl-postmalone', name: 'Post Malone', category: 'international', mainGenre: 'Hip-Hop/Rap', avatarUrl: '' },
  { id: 'intl-aviricii', name: 'Avicii', category: 'international', mainGenre: 'EDM', avatarUrl: '' },
  { id: 'artist_katy_perry', name: 'Katy Perry', category: 'international', mainGenre: 'Pop', avatarUrl: '' },
];

export let customArtists: Artist[] = [];

let cachedAllArtists: Artist[] | null = null;
let lastAllArtistsTime = 0;
let lastAllArtistsPoolSize = -1;
const ALL_ARTISTS_CACHE_TTL = 60_000;
const normCache = new Map<string, string>();

export function invalidateAllArtistsCache(): void {
  cachedAllArtists = null;
  lastAllArtistsTime = 0;
  lastAllArtistsPoolSize = -1;
}

export function loadCustomArtists(): void {
  try {
    invalidateAllArtistsCache();
    const dbArtists = dbService.getCustomArtists();
    if (dbArtists.length > 0) {
      customArtists = dbArtists;
      return;
    }
    if (fs.existsSync(CUSTOM_ARTISTS_FILE)) {
      const raw = fs.readFileSync(CUSTOM_ARTISTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        customArtists = parsed;
        for (const a of customArtists) {
          dbService.saveCustomArtist(a);
        }
      }
    }
  } catch (err) {
    console.error('Failed to load custom artists:', err);
  }
}

export function saveCustomArtists(): void {
  try {
    invalidateAllArtistsCache();
    fs.writeFileSync(CUSTOM_ARTISTS_FILE, JSON.stringify(customArtists, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save custom artists:', err);
  }
}

function normalizeSingleOrCollaboratorArtists(artist: Artist): Artist[] {
  const soloNames = extractSoloArtistNames(artist.name);
  if (soloNames.length <= 1) {
    const cleanName = soloNames[0] || cleanArtistDisplayName(artist.name) || artist.name;
    return [
      {
        ...artist,
        id: buildCanonicalArtistId(cleanName, artist.id),
        name: cleanName,
      },
    ];
  }
  return soloNames.map((soloName) => {
    const known = resolveKnownArtistEntity(soloName);
    return {
      ...artist,
      id: known?.id || buildCanonicalArtistId(soloName),
      name: known?.name || soloName,
      category: known?.category || artist.category,
      mainGenre: known?.mainGenre || artist.mainGenre,
      avatarUrl: known?.avatarUrl || artist.avatarUrl,
      isCustom: known ? known.isCustom : true,
    };
  });
}

export function addCustomArtist(newArtist: Artist): void {
  const expanded = normalizeSingleOrCollaboratorArtists(newArtist);
  for (const item of expanded) {
    const existingIdx = customArtists.findIndex(
      (a) => normalizeText(a.name) === normalizeText(item.name) || a.id === item.id
    );
    if (existingIdx >= 0) {
      customArtists[existingIdx] = {
        ...customArtists[existingIdx],
        ...item,
        avatarUrl: item.avatarUrl || customArtists[existingIdx].avatarUrl,
        trackCount: Math.max(customArtists[existingIdx].trackCount || 0, item.trackCount || 0),
      };
    } else {
      customArtists.push(item);
    }
    dbService.saveCustomArtist(item);
  }
  saveCustomArtists();
}

export function deleteCustomArtist(id: string): void {
  customArtists = customArtists.filter((a) => a.id !== id);
  saveCustomArtists();
  dbService.deleteCustomArtist(id);
}

export function syncCustomArtistsInMemory(incoming: Artist[]): void {
  for (const rawArtist of incoming) {
    for (const newArtist of normalizeSingleOrCollaboratorArtists(rawArtist)) {
      const existingIdx = customArtists.findIndex(
        (a) => normalizeText(a.name) === normalizeText(newArtist.name) || a.id === newArtist.id
      );
      if (existingIdx >= 0) {
        customArtists[existingIdx] = {
          ...customArtists[existingIdx],
          ...newArtist,
          avatarUrl: newArtist.avatarUrl || customArtists[existingIdx].avatarUrl,
          trackCount: Math.max(customArtists[existingIdx].trackCount || 0, newArtist.trackCount || 0),
        };
      } else {
        customArtists.push(newArtist);
      }
    }
  }
}

export function normalizeText(str: string): string {
  if (!str) return '';
  const cached = normCache.get(str);
  if (cached !== undefined) return cached;
  const computed = str
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/feat\..*|ft\..*/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (normCache.size < 15000) {
    normCache.set(str, computed);
  }
  return computed;
}

export const PROTECTED_BAND_NAMES: string[] = [
  'Whal & Dolph',
  'Earth, Wind & Fire',
  'Simon & Garfunkel',
  'Hall & Oates',
  'Years & Years',
  'Above & Beyond',
  'Chase & Status',
  'Mumford & Sons',
  'Tegan and Sara',
  'Florence + The Machine',
  'Florence and the Machine',
  "Guns N' Roses",
  'AC/DC',
  'Angus & Julia Stone',
  'Brooks & Dunn',
  'Dan + Shay',
  'Hootie & the Blowfish',
  'KC and the Sunshine Band',
  'Kool & the Gang',
  'Of Mice & Men',
  'Coheed and Cambria',
  'Echo & the Bunnymen',
  'Crosby, Stills, Nash & Young',
  'Crosby, Stills & Nash',
  'Emerson, Lake & Palmer',
  'Peter, Paul and Mary',
  'Blood, Sweat & Tears',
  'Belle and Sebastian',
  'She & Him',
  'Aly & AJ',
  'Chloe x Halle',
  'Sofi Tukker',
];

export function cleanArtistDisplayName(rawName: string): string {
  if (!rawName) return '';
  return rawName
    .replace(/\s*\((?:from|of)\s+[^)]+\)/gi, '')
    .replace(/\s*\[(?:from|of)\s+[^\]]+\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function protectKnownBands(input: string): { masked: string; restore: (token: string) => string } {
  const placeholders = new Map<string, string>();
  let masked = input;
  const allProtected = [
    ...PROTECTED_BAND_NAMES,
    ...CURATED_ARTISTS.map((a) => a.name),
  ].filter((name) => /[,&/]|(\band\b)|(\bx\b)/i.test(name));

  allProtected.forEach((band, idx) => {
    const escaped = band.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    if (regex.test(masked)) {
      const key = `__PROTECTED_BAND_${idx}__`;
      placeholders.set(key.toLowerCase(), band);
      masked = masked.replace(regex, key);
    }
  });

  return {
    masked,
    restore: (token: string) => {
      let out = token;
      for (const [key, band] of placeholders.entries()) {
        out = out.replace(new RegExp(key, 'gi'), band);
      }
      return out.trim();
    },
  };
}

// Only split on unambiguous collaboration separators. `and`, `/`, uppercase `X` stay intact
// so unknown bands ("Marina and the Diamonds", "AC/DC", "Lil Nas X") are never broken apart.
const COLLAB_SPLIT_REGEX =
  /\s*(?:,|&|\s+x\s+|\s+×\s+|\b(?:[Ff]eat|[Ff]t|FEAT|FT)\b\.?|\b(?:[Ff]eaturing|[Ww]ith)\b|ร่วมกับ)\s*/;

function splitCollabParts(masked: string, restore: (t: string) => string): string[] {
  return masked
    .split(COLLAB_SPLIT_REGEX)
    .map((t) => cleanArtistDisplayName(restore(t)).replace(/^[\s.]+|[\s.]+$/g, ''))
    .filter(Boolean);
}

export function extractSoloArtistNames(rawName: string, rawTitle?: string): string[] {
  const cleanedRaw = cleanArtistDisplayName(rawName || '');
  const { masked, restore } = protectKnownBands(cleanedRaw);

  const primaryParts = splitCollabParts(masked, restore).filter(
    (t) =>
      t.length >= 2 &&
      !/^(the\s+band|music|records|soundtrack|orchestra|original\s+cast|various\s+artists)$/i.test(t)
  );

  const results: string[] = [];
  const seen = new Set<string>();

  for (const p of primaryParts) {
    const norm = normalizeText(p);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      results.push(p);
    }
  }

  if (rawTitle) {
    const featMatches = Array.from(
      rawTitle.matchAll(/(?:\(|\[)(?:feat\.?|ft\.?|featuring|with|ร่วมกับ)\s+([^)\]]+)(?:\)|\])/gi)
    );
    for (const match of featMatches) {
      if (match[1]) {
        const { masked: fMasked, restore: fRestore } = protectKnownBands(match[1]);
        const featParts = splitCollabParts(fMasked, fRestore).filter((t) => t.length >= 2);
        for (const fp of featParts) {
          const norm = normalizeText(fp);
          if (norm && !seen.has(norm)) {
            seen.add(norm);
            results.push(fp);
          }
        }
      }
    }
  }

  return results;
}

export function resolveKnownArtistEntity(nameOrId: string): Artist | undefined {
  if (!nameOrId) return undefined;
  const clean = cleanArtistDisplayName(nameOrId);
  const norm = normalizeText(clean);
  const all = [...CURATED_ARTISTS, ...customArtists];
  return (
    all.find((a) => a.id === nameOrId) ||
    all.find((a) => normalizeText(a.name) === norm) ||
    all.find((a) => checkArtistStrictMatch(a.name, clean) && extractSoloArtistNames(a.name).length === 1)
  );
}

export function buildCanonicalArtistId(name: string, existingId?: string): string {
  const known = resolveKnownArtistEntity(existingId || name);
  if (known) return known.id;
  if (existingId && !existingId.startsWith('temp') && !existingId.startsWith('discovered-')) {
    return existingId;
  }
  const clean = cleanArtistDisplayName(name);
  const slug = normalizeText(clean).replace(/\s+/g, '_');
  return slug ? `artist_${slug}` : `artist_${Date.now()}`;
}

export function parseTrackArtistCredits(
  trackId: string,
  rawArtistName: string,
  rawTitle?: string,
  primaryArtistHint?: { id?: string; name?: string }
): TrackArtistCredit[] {
  const credits: TrackArtistCredit[] = [];
  const seenArtistIds = new Set<string>();

  const raw = rawArtistName || '';
  const featRegex = /\b(?:feat\.?|ft\.?|featuring|ร่วมกับ)\b/i;
  const featSplit = raw.split(featRegex);
  const mainArtistSegment = featSplit[0] || raw;
  const inlineFeatSegment = featSplit.slice(1).join(' , ');

  const mainNames = extractSoloArtistNames(mainArtistSegment);
  const featNamesFromArtist = inlineFeatSegment ? extractSoloArtistNames(inlineFeatSegment) : [];
  const allWithTitle = extractSoloArtistNames(raw, rawTitle);
  const mainNormSet = new Set(mainNames.map((n) => normalizeText(n)));
  const featNamesFromTitle = allWithTitle.filter((n) => !mainNormSet.has(normalizeText(n)));

  const pushCredit = (rawSingleName: string, role: ArtistRole) => {
    const clean = cleanArtistDisplayName(rawSingleName);
    if (!clean) return;
    const known = resolveKnownArtistEntity(clean);
    const matchesHint =
      primaryArtistHint?.name &&
      (normalizeText(primaryArtistHint.name) === normalizeText(clean) ||
        checkArtistStrictMatch(clean, primaryArtistHint.name));

    const canonicalName = known?.name || (matchesHint && primaryArtistHint?.name ? cleanArtistDisplayName(primaryArtistHint.name) : clean);
    const canonicalId =
      known?.id ||
      (matchesHint && primaryArtistHint?.id ? buildCanonicalArtistId(canonicalName, primaryArtistHint.id) : buildCanonicalArtistId(canonicalName));

    if (seenArtistIds.has(canonicalId)) return;
    seenArtistIds.add(canonicalId);
    credits.push({
      trackId: String(trackId),
      artistId: canonicalId,
      artistName: canonicalName,
      role,
      position: credits.length,
    });
  };

  mainNames.forEach((name, idx) => {
    pushCredit(name, idx === 0 ? 'primary' : 'collaborator');
  });

  for (const fn of [...featNamesFromArtist, ...featNamesFromTitle]) {
    pushCredit(fn, 'featured');
  }

  if (credits.length === 0 && raw.trim()) {
    pushCredit(raw.trim(), 'primary');
  }

  return credits;
}

export function detectCategory(
  name: string,
  tracks: Song[],
  fallback: 'thai' | 'international' = 'international'
): 'thai' | 'international' {
  const curated = CURATED_ARTISTS.find((a) => checkArtistStrictMatch(name, a.name));
  if (curated) return curated.category;

  const thaiCharRegex = /[\u0E00-\u0E7F]/;
  if (thaiCharRegex.test(name)) return 'thai';

  const thaiTrackCount = tracks.filter(
    (t) => thaiCharRegex.test(t.title) || thaiCharRegex.test(t.artistName)
  ).length;
  if (tracks.length > 0 && thaiTrackCount / tracks.length >= 0.25) {
    return 'thai';
  }

  if (tracks.length > 0 && thaiTrackCount === 0) {
    return 'international';
  }

  return fallback;
}

export function normalizeGenre(
  rawGenre: string,
  category: 'thai' | 'international',
  fallbackGenre?: string
): string {
  const g = (rawGenre || '').trim().toLowerCase();
  if (!g) {
    if (fallbackGenre && fallbackGenre !== 'any') return fallbackGenre;
    return category === 'thai' ? 'T-Pop' : 'Pop';
  }
  if (g.includes('k-pop') || g.includes('kpop')) return 'K-Pop';
  if (g.includes('hip-hop') || g.includes('hip hop') || g.includes('rap')) return 'Hip-Hop/Rap';
  if (g.includes('r&b') || g.includes('soul') || g.includes('funk')) return 'R&B';
  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) return 'Rock';
  if (g.includes('alternative') || g.includes('indie')) return 'Indie';
  if (g.includes('dance') || g.includes('electronic') || g.includes('house') || g.includes('edm')) return 'EDM';
  if (g.includes('country') || g.includes('ลูกทุ่ง') || g.includes('เพื่อชีวิต') || g.includes('folk')) {
    return category === 'thai' ? 'LukThung' : 'Country';
  }
  if (g.includes('soundtrack') || g.includes('score') || g.includes('musical') || g.includes('anime')) return 'Soundtrack';
  if (g.includes('jazz') || g.includes('blues')) return 'Jazz';
  if (g.includes('j-pop') || g.includes('jpop')) return 'J-Pop';
  if (g.includes('t-pop') || g.includes('thai pop')) return 'T-Pop';
  if (g.includes('pop') || g.includes('singer/songwriter') || g.includes('vocal')) {
    return category === 'thai' ? 'T-Pop' : 'Pop';
  }
  if (fallbackGenre && fallbackGenre !== 'any') return fallbackGenre;
  return category === 'thai' ? 'T-Pop' : 'Pop';
}

export function computeMajorityGenre(
  tracks: Song[],
  category: 'thai' | 'international',
  artistRawGenre?: string
): string {
  const mappedArtistGenre = artistRawGenre ? normalizeGenre(artistRawGenre, category) : '';
  const counts = new Map<string, number>();

  for (const t of tracks) {
    const g = t.genre || normalizeGenre('', category);
    // Weight non-Soundtrack tracks higher so OST songs don't override a band's real genre
    const weight = g === 'Soundtrack' ? 0.35 : 1;
    counts.set(g, (counts.get(g) || 0) + weight);
  }

  // Give official iTunes artist primaryGenreName a strong tie-breaking / primary boost
  if (mappedArtistGenre && mappedArtistGenre !== 'Soundtrack') {
    const boost = mappedArtistGenre === 'Pop' || mappedArtistGenre === 'T-Pop' ? 2 : Math.max(3, tracks.length * 0.25);
    counts.set(mappedArtistGenre, (counts.get(mappedArtistGenre) || 0) + boost);
  }

  let bestGenre = mappedArtistGenre || (category === 'thai' ? 'T-Pop' : 'Pop');
  let bestScore = -1;
  for (const [genre, score] of counts.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestGenre = genre;
    }
  }
  return bestGenre;
}

export function getAllArtists(songPool?: Map<string, Song>): Artist[] {
  const now = Date.now();
  const currentPoolSize = songPool ? songPool.size : 0;
  if (
    cachedAllArtists &&
    now - lastAllArtistsTime < ALL_ARTISTS_CACHE_TTL &&
    currentPoolSize === lastAllArtistsPoolSize
  ) {
    return cachedAllArtists;
  }

  try {
    const dbArtists = dbService.getCustomArtists();
    if (dbArtists && dbArtists.length > 0) {
      syncCustomArtistsInMemory(dbArtists);
    }
  } catch {}

  const map = new Map<string, Artist>();
  const poolValues = songPool ? Array.from(songPool.values()) : [];

  // Index non-junk songs by unique artistName and normalized track_artists credits
  const songsByArtistName = new Map<string, Song[]>();
  const songsByCreditKey = new Map<string, Song[]>();
  const featTitleSongs: Song[] = [];
  for (const s of poolValues) {
    if (isJunkTrack(s.title, s.albumName, s.artistName)) continue;
    if (!s.artists || s.artists.length === 0) {
      s.artists = parseTrackArtistCredits(s.id, s.artistName, s.title);
      s.artistIds = s.artists.map((c) => c.artistId);
    }
    for (const c of s.artists) {
      for (const k of [c.artistId, normalizeText(c.artistName)]) {
        if (!k) continue;
        const list = songsByCreditKey.get(k);
        if (list) list.push(s);
        else songsByCreditKey.set(k, [s]);
      }
    }
    const bucket = songsByArtistName.get(s.artistName);
    if (bucket) {
      bucket.push(s);
    } else {
      songsByArtistName.set(s.artistName, [s]);
    }
    if (/\((?:feat\.?|ft\.?|featuring|with|ร่วมกับ)\s+/i.test(s.title)) {
      featTitleSongs.push(s);
    }
  }

  for (const a of [...CURATED_ARTISTS, ...customArtists]) {
    const norm = a.name.toLowerCase();
    const matchedSongIds = new Set<string>();
    const tracks: Song[] = [];

    for (const creditKey of [a.id, normalizeText(a.name)]) {
      const creditSongs = songsByCreditKey.get(creditKey);
      if (creditSongs) {
        for (const s of creditSongs) {
          if (!matchedSongIds.has(s.id)) {
            matchedSongIds.add(s.id);
            tracks.push(s);
          }
        }
      }
    }

    for (const [rawArtistName, group] of songsByArtistName.entries()) {
      if (checkArtistStrictMatch(rawArtistName, a.name)) {
        for (const s of group) {
          if (!matchedSongIds.has(s.id)) {
            matchedSongIds.add(s.id);
            tracks.push(s);
          }
        }
      }
    }

    for (const s of featTitleSongs) {
      if (!matchedSongIds.has(s.id) && checkArtistStrictMatch(s.artistName, a.name, undefined, undefined, s.title)) {
        matchedSongIds.add(s.id);
        tracks.push(s);
      }
    }

    const effectiveCount =
      a.trackCount && a.trackCount > 0
        ? Math.max(a.trackCount, tracks.length)
        : tracks.length > 0
        ? tracks.length
        : dbService.searchSongs('', { artist: a.name, limit: 250 }).length;

    const hasValidAvatar = Boolean(
      a.avatarUrl &&
        (a.avatarUrl.startsWith('http://') ||
          a.avatarUrl.startsWith('https://') ||
          a.avatarUrl.startsWith('/'))
    );
    const avatar =
      (hasValidAvatar ? a.avatarUrl : '') ||
      tracks[0]?.artworkUrl ||
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80';
    map.set(norm, {
      ...a,
      avatarUrl: avatar,
      trackCount: effectiveCount,
    });
  }
  const result = Array.from(map.values());
  cachedAllArtists = result;
  lastAllArtistsTime = now;
  lastAllArtistsPoolSize = currentPoolSize;
  return result;
}

/**
 * Safe, non-destructive migration & backfill:
 * 1. Normalizes any legacy combined collaboration artist records in custom_artists / custom-artists.json
 *    into clean solo artist entities without losing tracks.
 * 2. Backfills track_artists junction rows for all songs in SQLite and hydrates songPool.
 */
export function backfillCollaborationsInDb(songPool?: Map<string, Song>): {
  normalizedArtists: number;
  backfilledCredits: number;
} {
  let normalizedArtists = 0;
  let backfilledCredits = 0;

  try {
    const dbArtists = dbService.getCustomArtists();
    let changedArtists = false;
    for (const row of dbArtists) {
      const soloNames = extractSoloArtistNames(row.name);
      const needsSplit = soloNames.length > 1 || (soloNames.length === 1 && soloNames[0] !== row.name);
      if (needsSplit && soloNames.length > 0) {
        dbService.deleteCustomArtist(row.id);
        for (const soloName of soloNames) {
          const cleanName = cleanArtistDisplayName(soloName);
          if (!cleanName) continue;
          const soloArtist: Artist = {
            id: buildCanonicalArtistId(cleanName),
            name: cleanName,
            category: row.category,
            mainGenre: row.mainGenre || 'Pop',
            avatarUrl: row.avatarUrl || '',
            isCustom: true,
            trackCount: row.trackCount || 0,
          };
          dbService.saveCustomArtist(soloArtist, false);
          addCustomArtist(soloArtist);
          normalizedArtists++;
          changedArtists = true;
        }
      }
    }
    if (changedArtists) {
      saveCustomArtists();
      invalidateAllArtistsCache();
    }

    const allSongs = songPool && songPool.size > 0 ? Array.from(songPool.values()) : dbService.getAllSongs();
    const missingCredits: TrackArtistCredit[] = [];
    for (const s of allSongs) {
      const credits = parseTrackArtistCredits(s.id, s.artistName, s.title);
      if (!s.artists || s.artists.length === 0) {
        s.artists = credits;
        s.artistIds = credits.map((c) => c.artistId);
        missingCredits.push(...credits);
      } else {
        s.artistIds = s.artists.map((c) => c.artistId);
      }
      if (songPool) {
        songPool.set(s.id, s);
      }
    }
    if (missingCredits.length > 0) {
      dbService.saveTrackArtists(missingCredits);
      backfilledCredits = missingCredits.length;
    }
  } catch (err) {
    console.warn('[BeatDrop] Backfill collaborations warning:', (err as Error).message);
  }

  return { normalizedArtists, backfilledCredits };
}


