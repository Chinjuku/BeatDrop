'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '../../../i18n/navigation';
import { useGame } from '../../../context/GameContext';
import { PageHero } from '../../../components/PageHero';
import {
  Play,
  ListChecks,
  Calendar,
  Mic2,
  Radio,
  Search,
  Loader2,
  X,
  Plus,
} from 'lucide-react';
import { Artist, CategoryType, GameMode } from '../../../types';

const MusicCategoriesPage: React.FC = () => {
  const t = useTranslations('Categories');
  const router = useRouter();
  const navigate = (p: string) => router.push(p);
  const { config, handleConfigChange, artists, setAddArtistOpen } = useGame();

  const [selectedTab, setSelectedTab] = useState<'genres' | 'eras' | 'artists'>('artists');
  const [searchQuery, setSearchQuery] = useState('');
  const [artistCategoryFilter, setArtistCategoryFilter] = useState<CategoryType>(
    config.category || 'all'
  );

  const genres = [
    { name: 'T-Pop', desc: t('genres.tpop') },
    { name: 'Pop', desc: t('genres.pop') },
    { name: 'Rock', desc: t('genres.rock') },
    { name: 'Indie', desc: t('genres.indie') },
    { name: 'R&B', desc: t('genres.rnb') },
    { name: 'Hip-Hop/Rap', desc: t('genres.hiphop') },
    { name: 'K-Pop', desc: t('genres.kpop') },
    { name: 'EDM', desc: t('genres.edm') },
  ];

  const eras = [
    { label: '2020s', value: '2020s', desc: t('eras.2020s') },
    { label: '2010s', value: '2010s', desc: t('eras.2010s') },
    { label: '2000s', value: '2000s', desc: t('eras.2000s') },
    { label: '1990s', value: '1990s', desc: t('eras.1990s') },
    { label: '1980s', value: '1980s', desc: t('eras.1980s') },
    { label: 'Classic', value: 'classic', desc: t('eras.classic') },
  ];

  // Instant In-Memory Library Artists filtered by category and search query
  const displayArtists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    // 1. Local base filtered by category
    const base = artists.filter((a) => {
      if (artistCategoryFilter === 'all') return true;
      return a.category === artistCategoryFilter;
    });

    if (!q) {
      return base;
    }

    const qNoVowels = q.replace(/[^a-z0-9\u0E00-\u0E7F]/g, '').replace(/[aeiou]/g, '');

    // 2. Filter local artists in library
    return base.filter((a) => {
      const aLower = a.name.toLowerCase();
      if (aLower.includes(q) || (a.mainGenre || '').toLowerCase().includes(q)) return true;
      const aNoVowels = aLower.replace(/[^a-z0-9\u0E00-\u0E7F]/g, '').replace(/[aeiou]/g, '');
      if (qNoVowels.length >= 3 && (aNoVowels.includes(qNoVowels) || qNoVowels.includes(aNoVowels))) {
        return true;
      }
      return false;
    });
  }, [artists, artistCategoryFilter, searchQuery]);

  // Matches in other category when current filter produces zero results
  const otherCategoryMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || artistCategoryFilter === 'all') return [];
    return artists.filter((a) => {
      if (a.category === artistCategoryFilter) return false;
      const aLower = a.name.toLowerCase();
      return aLower.includes(q) || (a.mainGenre || '').toLowerCase().includes(q);
    });
  }, [artists, searchQuery, artistCategoryFilter]);

  const handleLaunchQuiz = (
    mode: GameMode,
    filters: { genre?: string; year?: string; artist?: string }
  ) => {
    handleConfigChange(
      {
        ...config,
        mode: mode === 'guesser' ? 'guesser' : 'standard',
        genreFilter: filters.genre || 'any',
        yearFilter: filters.year || 'any',
        artistName: filters.artist,
        category: artistCategoryFilter !== 'all' ? artistCategoryFilter : config.category,
      },
      true
    );

    if (mode === 'guesser') {
      navigate('/guesser');
    } else {
      navigate('/play');
    }
  };

  return (
    <div className="w-full flex flex-col items-center max-w-4xl pt-1 sm:pt-4 pb-8 sm:pb-12">
      <PageHero
        title={t('title')}
        tagline={t('tagline')}
        gradient="from-white via-neutral-200 to-neutral-400"
      />
      <p
        className="text-xs sm:text-sm mb-4 sm:mb-5 px-2 text-center opacity-70 max-w-lg mx-auto leading-relaxed"
        style={{ color: 'var(--song-muted)' }}
      >
        {t('intro')}
      </p>

      {/* Segmented Filter Switcher (equal-width 3-tab layout; labels must never clip) */}
      <div
        role="tablist"
        aria-label={t('tabsLabel')}
        className="w-full max-w-md grid grid-cols-3 gap-1 p-1 sm:p-1.5 rounded-2xl border mb-4 sm:mb-6"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedTab('artists')}
          role="tab"
          aria-selected={selectedTab === 'artists'}
          className="w-full min-h-11 py-2 px-1 sm:px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1 sm:gap-2 transition"
          style={
            selectedTab === 'artists'
              ? {
                  backgroundColor: 'var(--song-accent)',
                  color: 'var(--song-accent-on)',
                }
              : {
                  color: 'var(--song-muted)',
                }
          }
        >
          <Mic2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>{t('tabs.artists')}</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('genres')}
          role="tab"
          aria-selected={selectedTab === 'genres'}
          className="w-full min-h-11 py-2 px-1 sm:px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1 sm:gap-2 transition"
          style={
            selectedTab === 'genres'
              ? {
                  backgroundColor: 'var(--song-accent)',
                  color: 'var(--song-accent-on)',
                }
              : {
                  color: 'var(--song-muted)',
                }
          }
        >
          <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>{t('tabs.genres')}</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('eras')}
          role="tab"
          aria-selected={selectedTab === 'eras'}
          className="w-full min-h-11 py-2 px-1 sm:px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1 sm:gap-2 transition"
          style={
            selectedTab === 'eras'
              ? {
                  backgroundColor: 'var(--song-accent)',
                  color: 'var(--song-accent-on)',
                }
              : {
                  color: 'var(--song-muted)',
                }
          }
        >
          <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>{t('tabs.eras')}</span>
        </button>
      </div>

      {/* Quick Search Input */}
      <div className="w-full max-w-md mb-4 sm:mb-6 relative">
        <div
          className="flex items-center px-3.5 py-2.5 rounded-2xl border transition focus-within:ring-2"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
          }}
        >
          <Search className="w-4 h-4 mr-2.5 shrink-0" style={{ color: 'var(--song-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full bg-transparent border-0 outline-none text-xs sm:text-sm font-semibold placeholder:opacity-50"
            style={{ color: 'var(--song-text)' }}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-1 rounded-full hover:bg-white/10 shrink-0 cursor-pointer"
              aria-label={t('clearSearch')}
            >
              <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Tab: Artists */}
      {selectedTab === 'artists' && (
        <div className="w-full space-y-3 sm:space-y-4">
          <div
            className="p-3 sm:p-4 rounded-2xl border flex flex-col gap-2.5 sm:gap-3"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
            }}
          >
            {/* Header Top Row: Title + Add Artist Button */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="text-xs sm:text-sm font-extrabold truncate">
                  {t('artists.heading')}
                </h3>
                <span className="text-[11px] sm:text-xs font-mono font-bold text-emerald-400 shrink-0">
                  ({displayArtists.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAddArtistOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition shrink-0 cursor-pointer whitespace-nowrap"
                title={t('artists.addTitle')}
              >
                <Plus className="w-3 h-3" />
                <span>{t('artists.add')}</span>
              </button>
            </div>

            {/* Header Bottom Row: Description + Responsive Category Filter Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-[11px] sm:text-xs opacity-75" style={{ color: 'var(--song-muted)' }}>
                {t('artists.hint')}
              </p>

              {/* Category Filter Pills (all / thai / international) */}
              <div
                className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded-xl border w-full sm:w-auto shrink-0"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: 'var(--song-border)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setArtistCategoryFilter('all')}
                  className="px-2 py-1.5 sm:px-2.5 sm:py-1 rounded-xl text-[11px] sm:text-xs font-bold transition text-center justify-center flex items-center"
                  style={
                    artistCategoryFilter === 'all'
                      ? {
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                        }
                      : { color: 'var(--song-muted)' }
                  }
                >
                  {t('filter.all')}
                </button>
                <button
                  type="button"
                  onClick={() => setArtistCategoryFilter('thai')}
                  className="px-2 py-1.5 sm:px-2.5 sm:py-1 rounded-xl text-[11px] sm:text-xs font-bold transition text-center justify-center flex items-center gap-1"
                  style={
                    artistCategoryFilter === 'thai'
                      ? {
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                        }
                      : { color: 'var(--song-muted)' }
                  }
                >
                  <span>{t('filter.thai')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setArtistCategoryFilter('international')}
                  className="px-2 py-1.5 sm:px-2.5 sm:py-1 rounded-xl text-[11px] sm:text-xs font-bold transition text-center justify-center flex items-center gap-1"
                  style={
                    artistCategoryFilter === 'international'
                      ? {
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                        }
                      : { color: 'var(--song-muted)' }
                  }
                >
                  <span>{t('filter.international')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Grid of Artist Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5">
            {displayArtists.map((art) => (
              <button
                key={art.id + art.name}
                type="button"
                onClick={() => handleLaunchQuiz('standard', { artist: art.name })}
                className="p-2 sm:p-3 rounded-xl border text-left flex items-center gap-2 sm:gap-2.5 transition hover:scale-[1.02] hover:border-[var(--song-accent)] group"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                }}
              >
                {/* Artist Photo Avatar */}
                <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden shrink-0 border border-white/10 bg-neutral-800 shadow-sm">
                  <img
                    src={
                      art.avatarUrl ||
                      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80'
                    }
                    alt={art.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80';
                    }}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-[11px] sm:text-sm truncate group-hover:text-[var(--song-accent-text)]">
                    {art.name}
                  </div>
                  <div className="text-[9px] sm:text-[10px] opacity-60 truncate">
                    {art.mainGenre || (art.category === 'thai' ? t('filter.thai') : t('filter.internationalShort'))}
                  </div>
                </div>
              </button>
            ))}

            {artists.length === 0 && !searchQuery.trim() ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="p-2 sm:p-3 rounded-xl border flex items-center gap-2 sm:gap-2.5 animate-pulse"
                  style={{
                    backgroundColor: 'var(--song-surface)',
                    borderColor: 'var(--song-border)',
                  }}
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="h-3 w-3/4 rounded bg-white/10" />
                    <div className="h-2 w-1/2 rounded bg-white/5" />
                  </div>
                </div>
              ))
            ) : displayArtists.length === 0 ? (
              <div
                className="col-span-full p-6 sm:p-8 text-center rounded-2xl border text-xs sm:text-sm space-y-3"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-muted)',
                }}
              >
                <p className="font-bold text-white">
                  {t('empty.noMatch', { query: searchQuery, category: t(artistCategoryFilter === 'thai' ? 'filter.thai' : artistCategoryFilter === 'international' ? 'filter.international' : 'filter.all') })}
                </p>
                {otherCategoryMatches.length > 0 ? (
                  <div className="pt-1">
                    <p className="text-xs text-emerald-400 mb-2">
                      {t('empty.otherCategory', { count: otherCategoryMatches.length, category: t(artistCategoryFilter === 'thai' ? 'filter.international' : 'filter.thai'), names: otherCategoryMatches.map((m) => m.name).join(', ') })}
                    </p>
                    <button
                      type="button"
                      onClick={() => setArtistCategoryFilter(artistCategoryFilter === 'thai' ? 'international' : 'thai')}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                    >
                      {t('empty.switchTo', { category: artistCategoryFilter === 'thai' ? t('filter.international') : t('filter.thai') })}
                    </button>
                  </div>
                ) : (
                  <div className="pt-2 flex flex-col items-center gap-2">
                    <p className="text-xs">
                      {t('empty.notInLibrary')}
                    </p>
                    <button
                      type="button"
                      onClick={() => setAddArtistOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition shadow-sm cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('empty.searchItunes')}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Tab: Genres */}
      {selectedTab === 'genres' && (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
          {(searchQuery.trim()
            ? genres.filter(
                (g) =>
                  g.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                  g.desc.toLowerCase().includes(searchQuery.toLowerCase().trim())
              )
            : genres
          ).map((g) => (
            <div
              key={g.name}
              className="p-3.5 sm:p-4 rounded-2xl border flex flex-col justify-between transition hover:border-[var(--song-accent)]"
              style={{
                backgroundColor: 'var(--song-surface)',
                borderColor: 'var(--song-border)',
              }}
            >
              <div>
                <h3 className="font-extrabold text-sm sm:text-base mb-1 sm:mb-1.5">{g.name}</h3>
                <p className="text-[11px] sm:text-xs opacity-75 line-clamp-2" style={{ color: 'var(--song-muted)' }}>
                  {g.desc}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-[var(--song-border)]">
                <button
                  type="button"
                  onClick={() => handleLaunchQuiz('standard', { genre: g.name })}
                  className="flex-1 py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition hover:brightness-110 shadow-sm"
                  style={{
                    backgroundColor: 'var(--song-accent)',
                    color: 'var(--song-accent-on)',
                  }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{t('clipPlay')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLaunchQuiz('guesser', { genre: g.name })}
                  className="py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition hover:brightness-110 shrink-0"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                    color: 'var(--song-text)',
                  }}
                  title={t('choiceTitle')}
                >
                  <ListChecks className="w-3.5 h-3.5 text-purple-400" />
                  <span>{t('choice')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Eras */}
      {selectedTab === 'eras' && (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5">
          {(searchQuery.trim()
            ? eras.filter(
                (e) =>
                  e.label.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                  e.desc.toLowerCase().includes(searchQuery.toLowerCase().trim())
              )
            : eras
          ).map((e) => (
            <div
              key={e.value}
              className="p-3.5 sm:p-4 rounded-2xl border flex flex-col justify-between transition hover:border-[var(--song-accent)]"
              style={{
                backgroundColor: 'var(--song-surface)',
                borderColor: 'var(--song-border)',
              }}
            >
              <div>
                <div className="flex items-center gap-2 text-base sm:text-lg mb-1 sm:mb-1.5">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                  <span className="font-extrabold text-sm sm:text-base">{e.label}</span>
                </div>
                <p className="text-[11px] sm:text-xs opacity-75 line-clamp-2" style={{ color: 'var(--song-muted)' }}>
                  {e.desc}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-[var(--song-border)]">
                <button
                  type="button"
                  onClick={() => handleLaunchQuiz('standard', { year: e.value })}
                  className="flex-1 py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition hover:brightness-110 shadow-sm"
                  style={{
                    backgroundColor: 'var(--song-accent)',
                    color: 'var(--song-accent-on)',
                  }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{t('eraPlay', { era: e.label })}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLaunchQuiz('guesser', { year: e.value })}
                  className="py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition hover:brightness-110 shrink-0"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                    color: 'var(--song-text)',
                  }}
                  title={t('choiceTitle')}
                >
                  <ListChecks className="w-3.5 h-3.5 text-purple-400" />
                  <span>{t('choice')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MusicCategoriesPage;

