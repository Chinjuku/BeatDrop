import { redirect } from 'next/navigation';
import { isAppLocale, routing } from '../../i18n/routing';
import { localizedPath } from '../../lib/i18nMetadata';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(localizedPath('/play', isAppLocale(locale) ? locale : routing.defaultLocale));
}
