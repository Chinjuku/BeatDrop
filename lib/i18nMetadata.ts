import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OG_LOCALES, isAppLocale, routing, type AppLocale } from '../i18n/routing';
import { OG_IMAGE, SITE_NAME, absoluteUrl } from './siteConfig';

/** Public path for a route in a locale: Thai has no prefix, English is under /en. */
export function localizedPath(path: string, locale: AppLocale): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return locale === routing.defaultLocale ? clean : `/${locale}${clean === '/' ? '' : clean}`;
}

/** canonical + hreflang alternates for one route. */
export function localizedAlternates(path: string, locale: AppLocale) {
  return {
    canonical: absoluteUrl(localizedPath(path, locale)),
    languages: {
      th: absoluteUrl(localizedPath(path, 'th')),
      en: absoluteUrl(localizedPath(path, 'en')),
      'x-default': absoluteUrl(localizedPath(path, routing.defaultLocale)),
    },
  };
}

/**
 * Metadata for a localized page. Reads `<page>.title` and `<page>.description`
 * from the Metadata namespace.
 */
export async function buildPageMetadata(
  rawLocale: string,
  page: 'play' | 'daily' | 'guesser' | 'categories' | 'privacy' | 'cookies' | 'room',
  path: string
): Promise<Metadata> {
  const locale: AppLocale = isAppLocale(rawLocale) ? rawLocale : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const title = t(`${page}.title`);
  const description = t(`${page}.description`);
  return {
    title,
    description,
    alternates: localizedAlternates(path, locale),
    openGraph: {
      title: `${title} • ${SITE_NAME}`,
      description,
      url: absoluteUrl(localizedPath(path, locale)),
      locale: OG_LOCALES[locale],
      type: 'website',
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} • ${SITE_NAME}`,
      description,
    },
  };
}
