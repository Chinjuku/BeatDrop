import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/siteConfig';
import { routing } from '../i18n/routing';
import { localizedPath } from '../lib/i18nMetadata';

export const dynamic = 'force-static';

type Entry = {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
};

const ROUTES: Entry[] = [
  { path: '/play', priority: 1, changeFrequency: 'daily' },
  { path: '/daily', priority: 0.9, changeFrequency: 'daily' },
  { path: '/guesser', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/categories', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  // One entry per route per locale, each listing every language version (hreflang).
  return ROUTES.flatMap(({ path, priority, changeFrequency }) =>
    routing.locales.map((locale) => ({
      url: absoluteUrl(localizedPath(path, locale)),
      lastModified,
      changeFrequency,
      priority,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, absoluteUrl(localizedPath(path, l))])
        ),
      },
    }))
  );
}
