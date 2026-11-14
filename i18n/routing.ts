import { defineRouting } from 'next-intl/routing';

/**
 * Thai is the default and keeps its existing, prefix-free URLs (`/play`).
 * English lives under `/en/...`. No Accept-Language redirect and next-intl's own cookie
 * stays off; the language the user picks in the menu is remembered by the strictly
 * necessary `beatdrop_locale` cookie (i18n/localePreference.ts, read in middleware.ts).
 */
export const routing = defineRouting({
  locales: ['th', 'en'],
  defaultLocale: 'th',
  localePrefix: 'as-needed',
  localeDetection: false,
  localeCookie: false,
});

export type AppLocale = (typeof routing.locales)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (routing.locales as readonly string[]).includes(value);
}

/** Open Graph locale codes per app locale. */
export const OG_LOCALES: Record<AppLocale, string> = { th: 'th_TH', en: 'en_US' };
