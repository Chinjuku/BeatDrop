import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalPage } from '../../../components/LegalPage';
import { PrivacyContentEn } from '../../../components/legal/PrivacyContentEn';
import { PrivacyContentTh } from '../../../components/legal/PrivacyContentTh';
import { buildPageMetadata } from '../../../lib/i18nMetadata';
import { SITE_NAME } from '../../../lib/siteConfig';

const LAST_UPDATED = '2026-11-13';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata(locale, 'privacy', '/privacy');
}

export default async function PrivacyPolicyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Privacy');

  return (
    <LegalPage title={t('title')} subtitle={t('subtitle', { site: SITE_NAME })} updated={LAST_UPDATED}>
      {locale === 'en' ? <PrivacyContentEn /> : <PrivacyContentTh />}
    </LegalPage>
  );
}
