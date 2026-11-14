/**
 * BeatDrop — lib/shareUtils.ts
 * Cross-platform clipboard & share utility with 100% device fallback:
 * 1. Web Share API (iOS Safari, Android Chrome)
 * 2. Modern Async Clipboard API (HTTPS)
 * 3. Legacy document.execCommand('copy') (In-app webviews: LINE, FB, IG, non-secure origins)
 */

import { HAS_PUBLIC_ORIGIN, SITE_URL } from './siteConfig';

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Try modern Async Clipboard API
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy execCommand
    }
  }

  // 2. Legacy textarea + execCommand('copy') fallback
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);

    textArea.focus({ preventScroll: true });
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareOptions {
  title: string;
  text: string;
  url?: string;
}

/**
 * Universal sharing with intelligent fallback:
 * - Uses Web Share API if supported.
 * - Respects user cancellation (AbortError) so clipboard toast does not mistakenly fire.
 * - Automatically falls back to dual-layer copyToClipboard if Web Share is unavailable.
 */
export async function shareOrCopy(options: ShareOptions): Promise<ShareResult> {
  if (typeof window === 'undefined') return 'failed';

  const fullShareText = options.url && !options.text.includes(options.url)
    ? `${options.text}\n${options.url}`
    : options.text;

  // 1. Web Share API
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const shareData: ShareData = {
        title: options.title,
        text: options.text,
        url: options.url,
      };
      if (typeof navigator.canShare !== 'function' || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return 'shared';
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return 'cancelled';
      }
      // If Web Share throws permission/support error, fall back to clipboard
    }
  }

  // 2. Clipboard fallback
  const copied = await copyToClipboard(fullShareText);
  return copied ? 'copied' : 'failed';
}


// ---------------------------------------------------------------------------
// Result text shared by every "copy / share result" button, so all of them read
// the same way and point at one canonical link.
// ---------------------------------------------------------------------------


export type ShareStageStatus = 'correct' | 'wrong' | 'skipped' | 'expired' | 'pending' | 'unused';

/** One square per clip stage. Same legend everywhere: green hit, yellow skip, red miss. */
const SHARE_SQUARES: Record<ShareStageStatus, string> = {
  correct: '🟩',
  skipped: '🟨',
  wrong: '🟥',
  expired: '🟥',
  pending: '⬜',
  unused: '⬜',
};

export function buildShareGrid(statuses: readonly ShareStageStatus[]): string {
  return statuses.map((status) => SHARE_SQUARES[status]).join('');
}

/**
 * Status of every stage from a round's guess history (stages never reached are 'unused').
 * Giving up is not written to history, so on a lost round the first stage that has no
 * entry is where the player gave up: mark it as a miss rather than as unplayed.
 */
export function stageStatusesFromHistory(
  stageCount: number,
  history: ReadonlyArray<{ stageIndex: number; status: 'correct' | 'wrong' | 'skipped' }>,
  lost = false
): ShareStageStatus[] {
  const statuses: ShareStageStatus[] = Array.from({ length: stageCount }, (_, idx) => {
    const item = history.find((h) => h.stageIndex === idx);
    return item ? item.status : 'unused';
  });
  if (lost && !statuses.includes('wrong')) {
    const gaveUpAt = statuses.indexOf('unused');
    if (gaveUpAt >= 0) statuses[gaveUpAt] = 'wrong';
  }
  return statuses;
}

/**
 * Public link for shared results. Uses the configured production origin, never the
 * address the player happens to be on (a LAN IP, a preview deployment, a locale prefix).
 */
export function shareLink(path = '/play'): string {
  const origin =
    HAS_PUBLIC_ORIGIN || typeof window === 'undefined' ? SITE_URL : window.location.origin;
  return `${origin}${path}`;
}

/** Host shown on the ticket artwork, e.g. `beatdrop.app`. */
export function shareHost(): string {
  try {
    return new URL(shareLink('/')).host;
  } catch {
    return 'BeatDrop';
  }
}

/** Plain-text clipboard version: the message, then the link on its own last line. */
export function withShareLink(text: string, url: string): string {
  return `${text}\n${url}`;
}

/** Display name for a difficulty id: `easy` -> `Easy`. */
export function difficultyName(id: string): string {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id;
}
