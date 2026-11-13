import React from 'react';
import type { Metadata } from 'next';
import { OG_IMAGE, SITE_NAME, absoluteUrl } from '../../lib/siteConfig';

const TITLE = 'Daily Challenge ทายเพลงประจำวัน';
const DESCRIPTION =
  'โจทย์ทายเพลงชุดเดียวกันทุกคนในแต่ละวัน รีเซ็ตตามเวลาไทย (UTC+7) ตรวจคะแนนที่เซิร์ฟเวอร์เพื่อความเป็นธรรม แล้วแชร์ผลพร้อมขึ้นลีดเดอร์บอร์ดรายวัน';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/daily') },
  openGraph: {
    title: `${TITLE} • ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl('/daily'),
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
