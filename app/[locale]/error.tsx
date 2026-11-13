'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';

/** Route-level error boundary: keeps the shell and offers a retry instead of a blank crash. */
export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('Common.error');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-extrabold" style={{ color: 'var(--song-text)' }}>{t('title')}</h1>
      <p className="text-sm" style={{ color: 'var(--song-muted)' }}>{t('body')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full px-5 py-2.5 text-sm font-bold"
          style={{ background: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
        >
          {t('retry')}
        </button>
        <Link
          href="/play"
          className="rounded-full border px-5 py-2.5 text-sm font-bold"
          style={{ borderColor: 'var(--song-border)', color: 'var(--song-text)' }}
        >
          {t('home')}
        </Link>
      </div>
    </div>
  );
}
