import { MAX_SNIPPET_DURATION, MIN_SNIPPET_DURATION } from './types';

/** Parses a typed clip length: clamped to the snippet bounds, rounded to 0.1 s; `fallback` if unparseable. */
export function normalizeClipInput(raw: string, fallback: number): number {
  const n = raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(MAX_SNIPPET_DURATION, Math.max(MIN_SNIPPET_DURATION, n));
  return Math.round(clamped * 10) / 10;
}

/** Case-insensitive artist-name search: prefix matches first, then substring matches; unique, capped at `limit`. */
export function filterArtistNames(names: readonly string[], query: string, limit: number): string[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!q) prefix.push(name);
    else if (key.startsWith(q)) prefix.push(name);
    else if (key.includes(q)) contains.push(name);
  }
  return [...prefix, ...contains].slice(0, limit);
}
