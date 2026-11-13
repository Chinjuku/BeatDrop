/**
 * Canonical, single source of truth for site identity, URLs and SEO defaults.
 * Safe to import from both Server and Client Components (no secrets, no node APIs).
 */

function normalizeBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** Public origin, e.g. `https://beatdrop.example`. No trailing slash. */
export const SITE_URL: string =
  normalizeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
  normalizeBaseUrl(process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL) ||
  normalizeBaseUrl(process.env.NEXT_PUBLIC_VERCEL_URL) ||
  'http://localhost:3000';

/** True only when a real public origin was configured (not the localhost fallback). */
export const HAS_PUBLIC_ORIGIN = !SITE_URL.startsWith('http://localhost');

export const SITE_NAME = 'BeatDrop';
export const SITE_TAGLINE = 'Hear less. Know more.';

export const SITE_TITLE = 'BeatDrop • เกมทายเพลงไทย & สากล จากเสี้ยววินาที';
export const SITE_DESCRIPTION =
  'BeatDrop คือเกมทายเพลงไทยและเพลงสากลจากเสี้ยววินาที ฟังสั้นที่สุดเท่าที่จะทำได้แล้วทายให้ไว ' +
  'มีโหมด Daily Challenge, Song Guesser, Artist, Genre และ Year พร้อมลีดเดอร์บอร์ดรายวัน ' +
  'A Thai & international music snippet guessing game — guess the song from a fraction of a second.';

export const SITE_KEYWORDS = [
  'BeatDrop',
  'เกมทายเพลง',
  'ทายเพลงไทย',
  'ทายเพลงสากล',
  'เกมทายเพลงออนไลน์',
  'ทายเพลงจากท่อนสั้น',
  'Daily Challenge ทายเพลง',
  'music guessing game',
  'Thai music quiz',
  'song quiz',
  'guess the song',
  'music snippet game',
];

export const SITE_LOCALES = ['th_TH', 'en_US'] as const;

/** Default social sharing image (PNG icon; replace with a 1200x630 OG image when available). */
export const OG_IMAGE = {
  url: '/icons/icon-512.png',
  width: 512,
  height: 512,
  alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
};

export const CONTACT_EMAIL = 'cjchinjung123@gmail.com';

/** Absolute URL helper for canonicals, sitemaps and structured data. */
export function absoluteUrl(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SITE_URL}${path === '/' ? '' : path}`;
}
