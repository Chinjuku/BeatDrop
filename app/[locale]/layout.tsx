import React from 'react';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OG_LOCALES, isAppLocale, routing } from '../../i18n/routing';
import { localizedAlternates, localizedPath } from '../../lib/i18nMetadata';
import '../globals.css';
import splashScreens from '../../lib/splashScreens.json';
import { ThemeProvider } from '../../context/ThemeContext';
import { GameProvider } from '../../context/GameContext';
import { QueryProvider } from '../../components/QueryProvider';
import { AppShell } from '../../components/AppShell';
import { ConsentProvider } from '../../context/ConsentContext';
import { StructuredData } from '../../components/StructuredData';
import {
  HAS_PUBLIC_ORIGIN,
  OG_IMAGE,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from '../../lib/siteConfig';

const BOOT_PAGE_DEFAULT = '#030704';
// Runs before first paint: reuse the player's last theme colour (stored only with
// preference consent) so a home-screen launch never flashes white.
const BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem('songspot:boot-page');if(c&&/^#[0-9a-fA-F]{3,8}$/.test(c)){var d=document.documentElement;d.style.backgroundColor=c;d.style.setProperty('--song-page',c);}}catch(e){}})();`;

type LocaleParams = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isAppLocale(raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const title = t('siteTitle');
  const description = t('siteDescription');
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      // Sub-pages supply only their own name; the brand is appended here once.
      template: `%s • ${SITE_NAME}`,
    },
    description,
    keywords: SITE_KEYWORDS,
    applicationName: SITE_NAME,
    category: 'games',
    alternates: localizedAlternates('/play', locale),
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: OG_LOCALES[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALES[l]),
      url: absoluteUrl(localizedPath('/play', locale)),
      title,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE.url],
    },
  // Preview deployments and un-configured origins stay out of the index.
  robots: HAS_PUBLIC_ORIGIN && process.env.VERCEL_ENV !== 'preview'
    ? {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-image-preview': 'large',
          'max-snippet': -1,
          'max-video-preview': -1,
        },
      }
    : { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'black-translucent',
    // iOS launch images (scripts/generate-splash.mjs): icon on the app background.
    startupImage: splashScreens,
  },
  formatDetection: { telephone: false },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#030704',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Shell' });

  return (
    <html lang={locale} className="dark" style={{ backgroundColor: BOOT_PAGE_DEFAULT }} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark" />
        {/* Older iOS only honours apple-touch-startup-image with this legacy flag. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Audio previews and artwork come from Apple's CDN — warm the connection early. */}
        <link rel="preconnect" href="https://is1-ssl.mzstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://itunes.apple.com" />
        <StructuredData />
      </head>
      <body>
        {/* PWA launch splash: app icon on the theme colour until the shell has mounted. */}
        <div id="beatdrop-boot-splash" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/beatdrop-icon.svg" alt="" width={150} height={150} />
        </div>
        <noscript>
          <style>{'#beatdrop-boot-splash{display:none}'}</style>
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
                {t('noscriptTitle')}
              </h1>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#9ca3af', marginBottom: '1.25rem' }}>
                {t('noscriptBody')}
              </p>
              <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                {t('noscriptHint')}
              </p>
            </div>
          </div>
        </noscript>
        <a href="#beatdrop-main" className="beatdrop-skip-link">
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>
        <QueryProvider>
          <ConsentProvider>
            <ThemeProvider>
              <GameProvider>
                <AppShell>{children}</AppShell>
              </GameProvider>
            </ThemeProvider>
          </ConsentProvider>
        </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

