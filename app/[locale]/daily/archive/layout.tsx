import React from 'react';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { buildPageMetadata } from '../../../../lib/i18nMetadata';

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata(locale, 'dailyArchive', '/daily/archive');
}

export default async function Layout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <>{children}</>;
}
