import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing, isAppLocale } from './i18n/routing';
import { LOCALE_PREFERENCE_COOKIE } from './i18n/localePreference';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // Thai URLs carry no prefix, so a visitor who picked English would land back on Thai at
  // `/`, `/play`, a bookmark or a PWA start_url. Honour the language they last chose.
  const saved = request.cookies.get(LOCALE_PREFERENCE_COOKIE)?.value;
  if (isAppLocale(saved) && saved !== routing.defaultLocale) {
    const { pathname } = request.nextUrl;
    const hasPrefix = routing.locales.some(
      (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
    );
    if (!hasPrefix) {
      const url = request.nextUrl.clone();
      url.pathname = `/${saved}${pathname === '/' ? '' : pathname}`;
      return NextResponse.redirect(url, 307);
    }
  }
  return intlMiddleware(request);
}

export const config = {
  // Skip API routes, Next internals, metadata routes and any file with an extension.
  matcher: ['/((?!api|_next|_vercel|sitemap.xml|robots.txt|manifest.webmanifest|sw.js|.*\\..*).*)'],
};
