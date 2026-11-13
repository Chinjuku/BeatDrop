import React from 'react';
import type { Metadata } from 'next';
import { OG_IMAGE, SITE_NAME, absoluteUrl } from '../../lib/siteConfig';

const TITLE = 'เล่นเกมทายเพลง';
const DESCRIPTION =
  'เริ่มเล่นทายเพลงไทยและสากลได้ทันที ฟังสนิปเพ็ตสั้น ๆ แล้วทายชื่อเพลงให้เร็วที่สุด ปรับความยาวเสียงได้ตั้งแต่ 0.1 วินาที ไม่ต้องสมัครสมาชิก เล่นฟรีบนเบราว์เซอร์';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/play') },
  openGraph: {
    title: `${TITLE} • ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl('/play'),
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
