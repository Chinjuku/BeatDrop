import type { MetadataRoute } from 'next';
import { HAS_PUBLIC_ORIGIN, absoluteUrl } from '../lib/siteConfig';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  // Preview/non-production origins must never be indexed.
  if (!HAS_PUBLIC_ORIGIN || process.env.VERCEL_ENV === 'preview') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
