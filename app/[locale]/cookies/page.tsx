import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalPage } from '../../../components/LegalPage';
import { CookiesContentEn } from '../../../components/legal/CookiesContentEn';
import { CookiesContentTh } from '../../../components/legal/CookiesContentTh';
import { buildPageMetadata } from '../../../lib/i18nMetadata';
import { SITE_NAME } from '../../../lib/siteConfig';

const LAST_UPDATED = '2026-11-13';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata(locale, 'cookies', '/cookies');
}

export default async function CookiesPolicyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Cookies');

  return (
    <LegalPage title={t('title')} subtitle={t('subtitle', { site: SITE_NAME })} updated={LAST_UPDATED}>
      {locale === 'en' ? <CookiesContentEn /> : <CookiesContentTh />}
    </LegalPage>
  );
}
