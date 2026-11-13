import React from 'react';
import type { Metadata } from 'next';

/** Operational surface — must never be indexed or appear in search results. */
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
