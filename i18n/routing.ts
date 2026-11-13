import { defineRouting } from 'next-intl/routing';

/**
 * Thai is the default and keeps its existing, prefix-free URLs (`/play`).
 * English lives under `/en/...`. The locale comes from the URL only: no Accept-Language
 * redirect and no locale cookie (so nothing new needs cookie consent).
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
