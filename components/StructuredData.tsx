import React from 'react';
import { getTranslations } from 'next-intl/server';
import {
  SITE_NAME,
  SITE_TAGLINE,
  absoluteUrl,
} from '../lib/siteConfig';

/**
 * JSON-LD for rich results. Server-rendered so crawlers see it without executing JS.
 * Kept to schema types Google actually supports for a free web game.
 */
export async function StructuredData() {
  const [tMeta, t] = await Promise.all([getTranslations('Metadata'), getTranslations('Shell')]);
  const siteDescription = tMeta('siteDescription');
  const faq = (['howToPlay', 'daily', 'cost', 'thaiSongs'] as const).map((key) => ({
    '@type': 'Question',
    name: t(`faq.${key}.q`),
    acceptedAnswer: { '@type': 'Answer', text: t(`faq.${key}.a`) },
  }));
  const graph = [
    {
      '@type': 'WebSite',
      '@id': absoluteUrl('/#website'),
      url: absoluteUrl('/'),
      name: SITE_NAME,
      alternateName: `${SITE_NAME} — ${SITE_TAGLINE}`,
      description: siteDescription,
      inLanguage: ['th-TH', 'en-US'],
      publisher: { '@id': absoluteUrl('/#organization') },
    },
    {
      '@type': 'Organization',
      '@id': absoluteUrl('/#organization'),
      name: SITE_NAME,
      url: absoluteUrl('/'),
      logo: absoluteUrl('/icons/icon-512.png'),
    },
    {
      '@type': ['VideoGame', 'WebApplication'],
      '@id': absoluteUrl('/#game'),
      name: SITE_NAME,
      url: absoluteUrl('/play'),
      description: siteDescription,
      inLanguage: ['th-TH', 'en-US'],
      applicationCategory: 'GameApplication',
      genre: ['Music', 'Quiz', 'Trivia'],
      gamePlatform: 'Web Browser',
      playMode: 'SinglePlayer',
      operatingSystem: 'Any (modern web browser)',
      browserRequirements: 'Requires JavaScript and Web Audio API support.',
      image: absoluteUrl('/icons/icon-512.png'),
      publisher: { '@id': absoluteUrl('/#organization') },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'THB',
        availability: 'https://schema.org/InStock',
      },
    },
    {
      '@type': 'FAQPage',
      '@id': absoluteUrl('/#faq'),
      mainEntity: faq,
    },
  ];

  return (
    <script
      type="application/ld+json"
      // Static, developer-authored content — no user input is interpolated.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c'),
      }}
    />
  );
}
