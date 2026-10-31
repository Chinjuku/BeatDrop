import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '../context/ThemeContext';
import { GameProvider } from '../context/GameContext';
import { AppShell } from '../components/AppShell';

export const metadata: Metadata = {
  title: 'BeatDrop • เกมทายเพลงไทย & สากล จากเสี้ยววินาที',
  description: 'Hear less. Know more. Thai & International Music Guessing Game on Next.js + Supabase.',
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
        <ThemeProvider>
          <GameProvider>
            <AppShell>{children}</AppShell>
          </GameProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

