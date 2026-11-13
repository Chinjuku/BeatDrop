import React from 'react';
import type { Metadata } from 'next';
import { OG_IMAGE, SITE_NAME, absoluteUrl } from '../../lib/siteConfig';

const TITLE = 'Song Guesser — โหมดเดาชื่อเพลง';
const DESCRIPTION =
  'โหมด Song Guesser ของ BeatDrop ฟังตัวอย่างเพลงแล้วพิมพ์ชื่อเพลงพร้อมระบบช่วยเติมคำ ยิ่งเดาถูกตั้งแต่ท่อนสั้นยิ่งได้คะแนนสูง';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/guesser') },
  openGraph: {
    title: `${TITLE} • ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl('/guesser'),
    type: 'website',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} • ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
