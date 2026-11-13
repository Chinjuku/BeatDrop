import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';

export default function NotFound() {
  const t = useTranslations('NotFound');
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black mb-4 border"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--song-accent) 15%, transparent)',
          borderColor: 'var(--song-accent)',
          color: 'var(--song-accent-text)',
        }}
      >
        404
      </div>
      <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-2">
        {t('title')}
      </h2>
      <p className="text-xs sm:text-sm max-w-sm mb-6 opacity-75" style={{ color: 'var(--song-muted)' }}>
        {t('body')}
      </p>
      <Link
        href="/play"
        className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition hover:brightness-110 shadow-lg"
        style={{
          backgroundColor: 'var(--song-accent)',
          color: 'var(--song-accent-on)',
        }}
      >
        {t('back')}
      </Link>
    </div>
  );
}

