import React from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '../context/ThemeContext';
import { GameProvider } from '../context/GameContext';
import { QueryProvider } from '../components/QueryProvider';
import { AppShell } from '../components/AppShell';

export const metadata: Metadata = {
  title: 'BeatDrop • เกมทายเพลงไทย & สากล จากเสี้ยววินาที',
  description: 'Hear less. Know more. Thai & International Music Guessing Game on Next.js + Supabase.',
  applicationName: 'BeatDrop',
  appleWebApp: {
    capable: true,
    title: 'BeatDrop',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#030704',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <QueryProvider>
          <ThemeProvider>
            <GameProvider>
              <AppShell>{children}</AppShell>
            </GameProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

