'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react';
import { useRouter } from '../../../i18n/navigation';
import { PageHero, HeroPillButton } from '../../../components/PageHero';
import { PrimaryButton, RoomCard, Segmented } from '../../../components/room/RoomControls';
import { useConsent } from '../../../context/ConsentContext';
import { appleMusicUrl, clearSongHistory, readSongHistory, spotifySearchUrl, type SongHistoryEntry } from '../../../lib/songHistory';

type Filter = 'missed' | 'correct' | 'all';

export default function HistoryPage() {
  const t = useTranslations('History');
  const router = useRouter();
  const { consent } = useConsent();
  const [entries, setEntries] = useState<SongHistoryEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>('missed');

  // localStorage is only readable after hydration, and only once consent is known.
  useEffect(() => setEntries(readSongHistory()), [consent]);

  const shown = useMemo(
    () =>
      (entries ?? []).filter(
        (e) => filter === 'all' || (filter === 'missed' ? e.outcome === 'failed' : e.outcome === 'correct')
      ),
    [entries, filter]
  );

  const onClear = () => {
    if (!window.confirm(t('clearConfirm'))) return;
    clearSongHistory();
    setEntries([]);
  };

  const linkClass = 'text-xs font-bold inline-flex items-center gap-1 underline underline-offset-4';

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-4 pb-10">
      <PageHero title={t('title')} tagline={t('tagline')} gradient="from-rose-200 via-pink-300 to-fuchsia-500">
        <HeroPillButton onClick={() => router.push('/play')} title={t('back')}>
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('back')}</span>
        </HeroPillButton>
      </PageHero>

      <RoomCard>
        <Segmented<Filter>
          label={t('filterLabel')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'missed', label: t('filterMissed') },
            { value: 'correct', label: t('filterCorrect') },
            { value: 'all', label: t('filterAll') },
          ]}
        />

        {entries !== null && (
          <p className="mt-3 text-xs" style={{ color: 'var(--song-muted)' }} aria-live="polite">
            {filter === 'missed'
              ? t('countMissed', { count: shown.length })
              : filter === 'correct'
                ? t('countCorrect', { count: shown.length })
                : t('countAll', { count: shown.length })}
          </p>
        )}

        {entries !== null && shown.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <p className="text-sm" style={{ color: 'var(--song-text)' }}>
              {entries.length === 0
                ? t('emptyAll')
                : filter === 'missed'
                  ? t('emptyMissed')
                  : t('emptyCorrect')}
            </p>
            <PrimaryButton onClick={() => router.push('/play')}>{t('startPlaying')}</PrimaryButton>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {shown.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-xl p-2 border"
                style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
              >
                {e.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.artworkUrl} alt={t('artworkAlt', { title: e.title })} width={56} height={56} loading="lazy" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg shrink-0" style={{ backgroundColor: 'var(--song-border)' }} aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold truncate" style={{ color: 'var(--song-text)' }}>{e.title}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--song-muted)' }}>{e.artistName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: e.outcome === 'failed' ? 'color-mix(in srgb, #ef4444 20%, transparent)' : 'color-mix(in srgb, #22c55e 20%, transparent)',
                        color: 'var(--song-text)',
                      }}
                    >
                      {e.outcome === 'failed' ? t('missed') : t('correct')}
                    </span>
                    {e.playCount > 1 && (
                      <span className="text-[11px]" style={{ color: 'var(--song-muted)' }}>{t('plays', { count: e.playCount })}</span>
                    )}
                    <a href={appleMusicUrl(e.title, e.artistName, e.trackViewUrl)} target="_blank" rel="noreferrer" className={linkClass} style={{ color: 'var(--song-muted)' }}>
                      <span>Apple Music</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                    <a href={spotifySearchUrl(e.title, e.artistName)} target="_blank" rel="noreferrer" className={linkClass} style={{ color: 'var(--song-muted)' }}>
                      <span>Spotify</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {/* Consent is only known on the client: render after mount (entries set) to avoid a hydration mismatch. */}
          <p className="text-xs" style={{ color: 'var(--song-muted)' }}>
            {entries === null ? ' ' : consent?.preferences ? t('localOnly') : t('needConsent')}
          </p>
          {entries !== null && entries.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-bold inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:brightness-110"
              style={{ color: 'var(--song-muted)' }}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('clear')}</span>
            </button>
          )}
        </div>
      </RoomCard>
    </div>
  );
}
