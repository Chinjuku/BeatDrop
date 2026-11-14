import type { AppLocale } from './routing';

/**
 * Remembers the language the user explicitly picked in the language menu.
 *
 * Strictly necessary (it only stores a choice the user made to change how the site is
 * shown, and is never read for anything else), so it is written regardless of the
 * optional `preferences` consent. Read server-side by middleware.ts.
 */
export const LOCALE_PREFERENCE_COOKIE = 'beatdrop_locale';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function saveLocalePreference(locale: AppLocale): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_PREFERENCE_COOKIE}=${locale}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
}
