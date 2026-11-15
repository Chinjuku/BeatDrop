import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAppLocale, routing, type AppLocale } from '../../../../../i18n/routing';
import { localizedAlternates, localizedPath } from '../../../../../lib/i18nMetadata';
import { OG_IMAGE, SITE_NAME, absoluteUrl } from '../../../../../lib/siteConfig';
import { OG_LOCALES } from '../../../../../i18n/routing';
import { getMergedArtists } from '../../../../../lib/engine/artistRoutes';
import { ArtistPageView } from '../../../../../components/artist/ArtistPageView';

type Params = Promise<{ locale: string; id: string }>;

/** Display name for metadata only; the page itself loads through the API. */
async function artistName(id: string): Promise<string | null> {
  try {
    return (await getMergedArtists()).find((a) => a.id === id)?.name ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: rawLocale, id: rawId } = await params;
  const locale: AppLocale = isAppLocale(rawLocale) ? rawLocale : routing.defaultLocale;
  const id = decodeURIComponent(rawId);
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const name = (await artistName(id)) ?? t('artist.fallbackName');
  const title = t('artist.title', { name });
  const description = t('artist.description', { name });
  const path = `/categories/artist/${encodeURIComponent(id)}`;
  return {
    title,
    description,
    alternates: localizedAlternates(path, locale),
    openGraph: {
      title: `${title} • ${SITE_NAME}`,
      description,
      url: absoluteUrl(localizedPath(path, locale)),
      locale: OG_LOCALES[locale],
      type: 'website',
      images: [OG_IMAGE],
    },
  };
}

export default async function ArtistPage({ params }: { params: Params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <ArtistPageView artistId={decodeURIComponent(id)} />;
}
