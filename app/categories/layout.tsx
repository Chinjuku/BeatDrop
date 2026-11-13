import React from 'react';
import type { Metadata } from 'next';
import { OG_IMAGE, SITE_NAME, absoluteUrl } from '../../lib/siteConfig';

const TITLE = 'หมวดหมู่และโหมดการเล่น';
const DESCRIPTION =
  'เลือกเล่นทายเพลงตามหมวดหมู่ที่ชอบ ทั้งเพลงไทย เพลงสากล แยกตามศิลปิน แนวเพลง ปี และยุคสมัย พร้อมระดับความยากให้เลือก';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/categories') },
  openGraph: {
    title: `${TITLE} • ${SITE_NAME}`,
    description: DESCRIPTION,
    url: absoluteUrl('/categories'),
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
