import React from 'react';
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  absoluteUrl,
} from '../lib/siteConfig';

/**
 * JSON-LD for rich results. Server-rendered so crawlers see it without executing JS.
 * Kept to schema types Google actually supports for a free web game.
 */
export function StructuredData() {
  const graph = [
    {
      '@type': 'WebSite',
      '@id': absoluteUrl('/#website'),
      url: absoluteUrl('/'),
      name: SITE_NAME,
      alternateName: `${SITE_NAME} — ${SITE_TAGLINE}`,
      description: SITE_DESCRIPTION,
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
      description: SITE_DESCRIPTION,
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
      mainEntity: [
        {
          '@type': 'Question',
          name: 'BeatDrop เล่นอย่างไร?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              'กดเล่นเพื่อฟังสนิปเพ็ตสั้น ๆ ของเพลง แล้วพิมพ์ชื่อเพลงที่คิดว่าใช่ ' +
              'ถ้ายังไม่แน่ใจสามารถขอฟังยาวขึ้นได้ แต่ยิ่งฟังสั้นยิ่งได้คะแนนมาก',
          },
        },
        {
          '@type': 'Question',
          name: 'Daily Challenge คืออะไร?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              'โจทย์ชุดเดียวกันสำหรับผู้เล่นทุกคนในแต่ละวัน รีเซ็ตตามเวลาไทย (UTC+7) ' +
              'คะแนนถูกตรวจสอบที่ฝั่งเซิร์ฟเวอร์และขึ้นลีดเดอร์บอร์ดรายวัน',
          },
        },
        {
          '@type': 'Question',
          name: 'ต้องสมัครสมาชิกหรือเสียเงินไหม?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'ไม่ต้อง BeatDrop เล่นฟรีบนเบราว์เซอร์ และไม่ต้องสร้างบัญชีผู้ใช้',
          },
        },
        {
          '@type': 'Question',
          name: 'มีเพลงไทยด้วยหรือไม่?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              'มี BeatDrop มีทั้งเพลงไทยและเพลงสากล เลือกได้ตามหมวดหมู่ ศิลปิน แนวเพลง หรือปีที่ออก',
          },
        },
      ],
    },
  ];

  return (
    <script
      type="application/ld+json"
      // Static, developer-authored content — no user input is interpolated.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }),
      }}
    />
  );
}
