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
        <noscript>
          <div
            style={{
              backgroundColor: '#0a0d0a',
              color: '#f3f4f6',
              padding: '2rem 1rem',
              textAlign: 'center',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              minHeight: '100vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                maxWidth: '480px',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '1.25rem',
                padding: '2rem',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎧</div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem', color: '#4ade80' }}>
                BeatDrop จำเป็นต้องเปิดใช้งาน JavaScript
              </h1>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#9ca3af', marginBottom: '1.25rem' }}>
                เกมทายเพลงจากเสี้ยววินาทีใช้งาน Web Audio API ในการประมวลผลเสียงและระบบเล่นเกมแบบเรียลไทม์
                กรุณาเปิดใช้งาน JavaScript ในการตั้งค่าเบราว์เซอร์ของคุณเพื่อเล่นเกม
              </p>
              <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                JavaScript is required to decode audio previews and play the game.
              </p>
            </div>
          </div>
        </noscript>
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

