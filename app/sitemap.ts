import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/siteConfig';

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
  return ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    lastModified,
    changeFrequency,
    priority,
  }));
}
