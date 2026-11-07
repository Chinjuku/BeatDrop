/**
 * BeatDrop — lib/shareUtils.ts
 * Cross-platform clipboard & share utility with 100% device fallback:
 * 1. Web Share API (iOS Safari, Android Chrome)
 * 2. Modern Async Clipboard API (HTTPS)
 * 3. Legacy document.execCommand('copy') (In-app webviews: LINE, FB, IG, non-secure origins)
 */

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

