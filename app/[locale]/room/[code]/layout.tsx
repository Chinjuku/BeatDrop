import React from 'react';
import type { Metadata } from 'next';

// Individual rooms are private and short-lived: keep them out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function RoomCodeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
