'use client';

/**
 * Full-page artist view: hero, quiz/shuffle actions, sorted song tabs, per-row 30 s previews
 * and a sticky mini-player. Data from GET /api/artists/[id]; audio via opaque preview tokens.
 */
import React, { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Pause, Play, RotateCcw, Shuffle, SkipForward, X } from 'lucide-react';
import { useRouter } from '../../i18n/navigation';
import { BackButton } from '../BackButton';
import { useGame } from '../../context/GameContext';
import { useArtistPreviewPlayer, type ArtistPreviewPlayer } from '../../hooks/useArtistPreviewPlayer';
import {
  ARTIST_PREVIEW_SECONDS,
  availableTabs,
  formatClock,
  groupByAlbum,
  sortLatest,
  sortPopular,
  type ArtistPageData,
  type ArtistPageSong,
  type ArtistPageTab,
} from '../../shared/artistPage';

const FALLBACK_ART = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&auto=format&fit=crop&q=80';

class ArtistNotFoundError extends Error {}

function isArtistPageData(value: unknown): value is ArtistPageData {
  if (!value || typeof value !== 'object') return false;
  const v = value as { artist?: { id?: unknown; name?: unknown }; songs?: unknown };
  return (
    typeof v.artist?.id === 'string' &&
    typeof v.artist?.name === 'string' &&
    Array.isArray(v.songs) &&
    v.songs.every(
      (s: unknown) =>
        !!s &&
        typeof (s as ArtistPageSong).id === 'string' &&
        typeof (s as ArtistPageSong).title === 'string' &&
        typeof (s as ArtistPageSong).audioUrl === 'string' &&
        (s as ArtistPageSong).audioUrl.startsWith('/api/artists/preview?')
    )
  );
}

async function fetchArtistPage(id: string, signal: AbortSignal): Promise<ArtistPageData> {
  const res = await fetch(`/api/artists/${encodeURIComponent(id)}`, { signal, cache: 'no-store' });
  if (res.status === 404) throw new ArtistNotFoundError(id);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: unknown };
  if (!isArtistPageData(json.data)) throw new Error('Malformed artist page response');
  return json.data;
}

function Artwork({ src, alt, className }: { src: string; alt: string; className: string }) {
  return (
    <img
      src={src || FALLBACK_ART}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src !== FALLBACK_ART) img.src = FALLBACK_ART;
      }}
    />
  );
}

function EqBars() {
  return (
    <span className="inline-flex items-end gap-[2px] h-2.5 ml-1.5 align-middle" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-sm bg-[var(--song-accent)] h-2.5 motion-safe:animate-[artist-eq_0.8s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

interface SongRowProps {
  song: ArtistPageSong;
  index: number;
  player: ArtistPreviewPlayer;
}

function SongRow({ song, index, player }: SongRowProps) {
  const t = useTranslations('ArtistPage');
  const isCurrent = player.current?.id === song.id;
  const isActive = isCurrent && (player.status === 'playing' || player.status === 'loading');
  const failed = player.failedIds.has(song.id);
  const meta = [song.albumName, song.releaseYear > 0 ? String(song.releaseYear) : ''].filter(Boolean).join(' · ');

  return (
    <li>
      <button
        type="button"
        onClick={() => player.toggle(song)}
        aria-pressed={isActive}
        aria-label={isActive ? t('row.pause', { title: song.title }) : t('row.play', { title: song.title })}
        className={`w-full flex items-center gap-2.5 sm:gap-3 px-2 py-2 rounded-xl text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--song-accent)] ${
          isCurrent ? 'bg-[var(--song-surface-soft)]' : 'hover:bg-[var(--song-surface)]'
        }`}
      >
        <span className="w-5 text-right text-xs font-extrabold tabular-nums shrink-0" style={{ color: 'var(--song-muted)' }}>
          {index}
        </span>
        <Artwork src={song.artworkUrl} alt="" className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover shrink-0 bg-neutral-800" />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-extrabold truncate ${isCurrent ? 'text-[var(--song-accent-text)]' : ''}`}>
            {song.title}
            {isActive && player.status === 'playing' ? <EqBars /> : null}
          </span>
          <span className="block text-[11px] sm:text-xs truncate" style={{ color: 'var(--song-muted)' }}>
            {failed ? t('row.unavailable') : meta || song.artistName}
          </span>
        </span>
        <span
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border transition ${
            isActive
              ? 'bg-[var(--song-accent)] border-[var(--song-accent)] text-[var(--song-accent-on)]'
              : 'border-[var(--song-border)]'
          }`}
          aria-hidden="true"
        >
          {isCurrent && player.status === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isActive ? (
            <Pause className="w-4 h-4" fill="currentColor" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
          )}
        </span>
      </button>
    </li>
  );
}

function MiniPlayer({ player }: { player: ArtistPreviewPlayer }) {
  const t = useTranslations('ArtistPage');
  const song = player.current;
  if (!song) return null;
  const isActive = player.status === 'playing' || player.status === 'loading';
  const progress = Math.min(100, (player.elapsed / ARTIST_PREVIEW_SECONDS) * 100);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
      <section
        aria-label={t('player.region')}
        className="pointer-events-auto mx-auto w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <button
            type="button"
            onClick={player.togglePlayback}
            aria-label={isActive ? t('player.pause') : t('player.play')}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-black/15 hover:bg-black/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--song-accent-on)]"
          >
            {player.status === 'loading' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isActive ? (
              <Pause className="w-4 h-4" fill="currentColor" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
            )}
          </button>
          <Artwork src={song.artworkUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 hidden sm:block" />
          <div className="min-w-0 flex-1" aria-live="polite">
            <div className="text-sm font-extrabold truncate">{song.title}</div>
            <div className="text-[11px] font-semibold truncate opacity-75">
              {player.shuffle ? `${t('player.shuffleOn')} · ` : ''}
              {song.artistName}
            </div>
          </div>
          <span className="text-xs font-extrabold tabular-nums shrink-0" aria-hidden="true">
            {formatClock(player.elapsed)} / {formatClock(ARTIST_PREVIEW_SECONDS)}
          </span>
          {player.shuffle ? (
            <button
              type="button"
              onClick={player.next}
              aria-label={t('player.next')}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 hover:bg-black/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--song-accent-on)]"
            >
              <SkipForward className="w-4 h-4" fill="currentColor" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={player.stop}
            aria-label={t('player.close')}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 hover:bg-black/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--song-accent-on)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div
          className="h-1 bg-black/15"
          role="progressbar"
          aria-label={song.title}
          aria-valuemin={0}
          aria-valuemax={ARTIST_PREVIEW_SECONDS}
          aria-valuenow={Math.floor(player.elapsed)}
          aria-valuetext={`${formatClock(player.elapsed)} / ${formatClock(ARTIST_PREVIEW_SECONDS)}`}
        >
          <div className="h-full bg-[var(--song-accent-on)] transition-[width] duration-200 ease-linear" style={{ width: `${progress}%` }} />
        </div>
      </section>
    </div>
  );
}

function StatePanel({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div
      className="w-full p-6 sm:p-8 text-center rounded-2xl border space-y-3"
      style={{ backgroundColor: 'var(--song-surface)', borderColor: 'var(--song-border)' }}
    >
      <p className="font-extrabold text-sm sm:text-base">{title}</p>
      {body ? (
        <p className="text-xs sm:text-sm" style={{ color: 'var(--song-muted)' }}>
          {body}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="w-full lg:grid lg:grid-cols-[300px_1fr] lg:gap-8 animate-pulse">
      <div className="rounded-2xl h-28 lg:h-72 bg-white/5" />
      <div className="mt-4 lg:mt-0 space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <div className="w-5 h-3 rounded bg-white/5" />
            <div className="w-11 h-11 rounded-lg bg-white/10" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 rounded bg-white/10" />
              <div className="h-2 w-1/3 rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ArtistPageView({ artistId }: { artistId: string }) {
  const t = useTranslations('ArtistPage');
  const router = useRouter();
  const { config, handleConfigChange } = useGame();
  const player = useArtistPreviewPlayer();
  const [tab, setTab] = useState<ArtistPageTab>('popular');
  const tabRefs = useRef<Partial<Record<ArtistPageTab, HTMLButtonElement | null>>>({});

  const query = useQuery({
    queryKey: ['artist-page', artistId],
    queryFn: ({ signal }) => fetchArtistPage(artistId, signal),
    // Audio tokens expire after 2 h: refresh a tab that comes back after 30 min.
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    gcTime: 60 * 60 * 1000,
    retry: (count, err) => !(err instanceof ArtistNotFoundError) && count < 2,
  });

  const data = query.data;
  const songs = data?.songs ?? [];
  const tabs = useMemo(() => availableTabs(songs), [songs]);
  const activeTab: ArtistPageTab = tabs.includes(tab) ? tab : 'popular';

  const tabSongs = useMemo(() => {
    if (activeTab === 'latest') return sortLatest(songs);
    if (activeTab === 'collabs') return sortPopular(songs.filter((s) => s.isCollab));
    return sortPopular(songs);
  }, [activeTab, songs]);
  const albumGroups = useMemo(() => (activeTab === 'albums' ? groupByAlbum(sortPopular(songs)) : []), [activeTab, songs]);

  const startQuiz = () => {
    if (!data) return;
    player.stop();
    handleConfigChange(
      {
        ...config,
        mode: 'standard',
        genreFilter: 'any',
        yearFilter: 'any',
        artistName: data.artist.name,
        category: data.artist.category,
      },
      true
    );
    router.push('/play');
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = tabs.indexOf(activeTab);
    let nextIdx = -1;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabs.length - 1;
    if (nextIdx < 0) return;
    e.preventDefault();
    const nextTab = tabs[nextIdx];
    setTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const backLink = (
    <div className="mb-3 sm:mb-4">
      <BackButton href="/categories" label={t('back')} />
    </div>
  );

  if (query.isPending) {
    return (
      <div className="w-full max-w-4xl pt-1 sm:pt-4 pb-8">
        {backLink}
        <LoadingSkeleton label={t('loading')} />
      </div>
    );
  }

  if (query.isError) {
    const notFound = query.error instanceof ArtistNotFoundError;
    return (
      <div className="w-full max-w-4xl pt-1 sm:pt-4 pb-8">
        {backLink}
        {notFound ? (
          <StatePanel title={t('notFound.title')} body={t('notFound.body')} />
        ) : (
          <StatePanel title={t('error.title')}>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--song-accent)]"
              style={{ borderColor: 'var(--song-border)' }}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              {t('error.retry')}
            </button>
          </StatePanel>
        )}
      </div>
    );
  }

  const { artist } = query.data;
  const categoryLabel = artist.category === 'thai' ? t('category.thai') : t('category.international');
  const subline = [categoryLabel, artist.mainGenre, t('songCount', { count: songs.length })].filter(Boolean).join(' · ');

  return (
    <div className={`w-full max-w-4xl pt-1 sm:pt-4 ${player.current ? 'pb-28' : 'pb-10'}`}>
      {backLink}
      <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-8 lg:items-start">
        <aside className="lg:sticky lg:top-20">
          <div
            className="rounded-2xl p-4 sm:p-5 flex lg:flex-col items-center lg:items-start gap-3.5 sm:gap-4 border"
            style={{
              background: 'linear-gradient(160deg, color-mix(in srgb, var(--song-accent) 18%, var(--song-surface)), var(--song-stage))',
              borderColor: 'var(--song-border)',
            }}
          >
            <Artwork
              src={artist.avatarUrl}
              alt={artist.name}
              className="w-16 h-16 sm:w-20 sm:h-20 lg:w-32 lg:h-32 rounded-full object-cover shrink-0 border border-white/10 bg-neutral-800"
            />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black leading-tight break-words">{artist.name}</h1>
              <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--song-muted)' }}>
                {subline}
              </p>
            </div>
          </div>
          <div className="flex lg:flex-col gap-2 mt-3">
            <button
              type="button"
              onClick={startQuiz}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-sm font-extrabold transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--song-accent)]"
              style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
            >
              <Play className="w-4 h-4" fill="currentColor" aria-hidden="true" />
              {t('startQuiz')}
            </button>
            <button
              type="button"
              onClick={() => player.playShuffle(tabSongs.length > 0 ? tabSongs : songs)}
              disabled={songs.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-sm font-extrabold border transition hover:border-[var(--song-accent)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--song-accent)]"
              style={{ backgroundColor: 'var(--song-surface)', borderColor: 'var(--song-border)' }}
            >
              <Shuffle className="w-4 h-4" aria-hidden="true" />
              {t('shuffle')}
            </button>
          </div>
        </aside>

        <section className="mt-4 lg:mt-0 min-w-0">
          {songs.length === 0 ? (
            <StatePanel title={t('empty.title')} body={t('empty.body')} />
          ) : (
            <>
              <div role="tablist" aria-label={t('tabsLabel')} className="flex gap-1.5 overflow-x-auto pb-1 mb-2 -mx-1 px-1">
                {tabs.map((id) => {
                  const selected = id === activeTab;
                  return (
                    <button
                      key={id}
                      ref={(el) => {
                        tabRefs.current[id] = el;
                      }}
                      type="button"
                      role="tab"
                      id={`artist-tab-${id}`}
                      aria-selected={selected}
                      aria-controls="artist-tabpanel"
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setTab(id)}
                      onKeyDown={onTabKeyDown}
                      className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--song-accent)]"
                      style={
                        selected
                          ? { backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }
                          : { backgroundColor: 'var(--song-surface)', color: 'var(--song-muted)' }
                      }
                    >
                      {t(`tabs.${id}`)}
                    </button>
                  );
                })}
              </div>
              <div id="artist-tabpanel" role="tabpanel" aria-labelledby={`artist-tab-${activeTab}`}>
                {activeTab === 'albums' ? (
                  <div className="space-y-4">
                    {albumGroups.map((group) => (
                      <section key={group.album || '__none'} aria-label={group.album || t('album.unknown')}>
                        <h2 className="px-2 pb-1 text-xs font-extrabold uppercase tracking-wide" style={{ color: 'var(--song-muted)' }}>
                          {group.album || t('album.unknown')}
                          {group.year > 0 ? ` · ${group.year}` : ''}
                        </h2>
                        <ol className="space-y-0.5">
                          {group.songs.map((s, i) => (
                            <SongRow key={s.id} song={s} index={i + 1} player={player} />
                          ))}
                        </ol>
                      </section>
                    ))}
                  </div>
                ) : (
                  <ol className="space-y-0.5">
                    {tabSongs.map((s, i) => (
                      <SongRow key={s.id} song={s} index={i + 1} player={player} />
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </section>
      </div>
      <MiniPlayer player={player} />
    </div>
  );
}
