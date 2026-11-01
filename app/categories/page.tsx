'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGame } from '../../context/GameContext';
import {
  Compass,
  Play,
  ListChecks,
  Calendar,
  Mic2,
  Radio,
  Search,
  Loader2,
  X,
} from 'lucide-react';
import { Artist, CategoryType, GameMode } from '../../types';

const MusicCategoriesPage: React.FC = () => {
  const router = useRouter();
  const navigate = (p: string) => router.push(p);
  const { config, handleConfigChange, artists } = useGame();

  const [selectedTab, setSelectedTab] = useState<'genres' | 'eras' | 'artists'>('artists');
  const [searchQuery, setSearchQuery] = useState('');
  const [artistCategoryFilter, setArtistCategoryFilter] = useState<CategoryType>(
    config.category || 'all'
  );
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const [discoveredArtists, setDiscoveredArtists] = useState<Artist[]>([]);

  const genres = [
    { name: 'T-Pop', icon: '🇹🇭', desc: 'เพลงป๊อปไทยยอดฮิตติดชาร์ต ทั้งกระแสใหม่และคุ้นหู' },
    { name: 'Pop', icon: '✨', desc: 'ท่อนฮุกติดหูจากเพลงป๊อปสากลและไทยยอดนิยม' },
    { name: 'Rock', icon: '⚡', desc: 'ชาวร็อคจัดเต็ม กีตาร์โซโล่และเสียงร้องสุดมันส์' },
    { name: 'Indie', icon: '🌿', desc: 'เพลงอินดี้ไทยและนอกกระแส เมโลดี้เพราะฟังสบาย' },
    { name: 'R&B', icon: '🌙', desc: 'บีตสมูท กลิ่นอาย R&B & Soul ทั้งไทยและสากล' },
    { name: 'Hip-Hop/Rap', icon: '🔥', desc: 'ไรห์มดุ บีตหนัก รวมเพลงฮิปฮอปสุดเดือด' },
    { name: 'K-Pop', icon: '💜', desc: 'เพลงเคป๊อปยอดฮิต ไอดอลเกาหลีชื่อดัง' },
    { name: 'EDM', icon: '🎛️', desc: 'เพลงแดนซ์อิเล็กทรอนิกส์และคลับมิกซ์' },
  ];

  const eras = [
    { label: '2020s', value: '2020s', desc: 'เพลงยุคปัจจุบัน (2020 - ปัจจุบัน) ไวรัลและชาร์ต Billboard' },
    { label: '2010s', value: '2010s', desc: 'ยุคทองเพลงสตรีมมิ่ง (2010 - 2019)' },
    { label: '2000s', value: '2000s', desc: 'ยุคมิลเลนเนียม ยุค MP3 และอัลบั้มดัง (2000 - 2009)' },
    { label: '1990s', value: '1990s', desc: 'ยุคเทปคาสเซ็ท เพลงอัลเทอร์เนทีฟ & ป๊อป 90s' },
    { label: '1980s', value: '1980s', desc: 'ยุคซินธ์ป๊อป ยุค 80s ดิสโก้สุดคลาสสิก' },
    { label: 'Classic', value: 'classic', desc: 'เพลงระดับตำนานเหนือกาลเวลา' },
  ];

  // Live remote discovery search (e.g. searching "Illslick" or any artist)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setDiscoveredArtists([]);
      setIsSearchingRemote(false);
      return;
    }

    const abortCtrl = new AbortController();

    const timer = setTimeout(async () => {
      setIsSearchingRemote(true);
      try {
        const catParam =
          artistCategoryFilter !== 'all' ? `&category=${artistCategoryFilter}` : '';
        const res = await fetch(
          `/api/artists?q=${encodeURIComponent(trimmed)}&discover=true${catParam}`,
          { signal: abortCtrl.signal }
        );
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data)) {
          setDiscoveredArtists(json.data);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return;
        console.warn('Failed to discover artists:', err);
      } finally {
        if (!abortCtrl.signal.aborted) {
          setIsSearchingRemote(false);
        }
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      abortCtrl.abort();
    };
  }, [searchQuery, artistCategoryFilter]);

  // Combined Artists filtered by category and search query
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

    // 2. Filter local artists
    const localMatches = base.filter((a) => {
      const aLower = a.name.toLowerCase();
      if (aLower.includes(q) || (a.mainGenre || '').toLowerCase().includes(q)) return true;
      const aNoVowels = aLower.replace(/[^a-z0-9\u0E00-\u0E7F]/g, '').replace(/[aeiou]/g, '');
      if (qNoVowels.length >= 3 && (aNoVowels.includes(qNoVowels) || qNoVowels.includes(aNoVowels))) {
        return true;
      }
      return false;
    });

    // 3. Merge discovered artists from API without duplicate names
    const existingNames = new Set(localMatches.map((a) => a.name.toLowerCase()));
    const newDiscovered = discoveredArtists.filter((a) => {
      const matchCat =
        artistCategoryFilter === 'all' || a.category === artistCategoryFilter;
      return matchCat && !existingNames.has(a.name.toLowerCase());
    });

    return [...localMatches, ...newDiscovered];
  }, [artists, artistCategoryFilter, searchQuery, discoveredArtists]);

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
    <div className="w-full flex flex-col items-center max-w-4xl my-auto">
      {/* Hero Header */}
      <div className="text-center mb-6">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-2 text-xs font-bold"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--song-accent) 15%, transparent)',
            borderColor: 'var(--song-accent)',
            color: 'var(--song-accent-text)',
          }}
        >
          <Compass className="w-4 h-4" />
          <span>MUSIC CATEGORIES</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
          Music Categories (สำรวจแนวเพลง ยุคสมัย และศิลปิน)
        </h1>
        <p className="text-xs sm:text-sm mt-1.5 opacity-70" style={{ color: 'var(--song-muted)' }}>
          ท้าทายความจำด้วยการฟังเสี้ยววินาที หรือตอบแบบ 4 ตัวเลือก ในแนวเพลง ยุคสมัย หรือศิลปินที่คุณชื่นชอบ
        </p>
      </div>

      {/* Segmented Filter Switcher */}
      <div
        className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-1 sm:gap-2 p-1 sm:p-1.5 rounded-2xl border mb-6 max-w-full overflow-x-auto"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedTab('artists')}
          className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-1.5 sm:gap-2 transition whitespace-nowrap"
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
          <Mic2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>ศิลปิน (Artists)</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('genres')}
          className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-1.5 sm:gap-2 transition whitespace-nowrap"
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
          <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>แนวเพลง (Genres)</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('eras')}
          className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-1.5 sm:gap-2 transition whitespace-nowrap"
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
          <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>ยุคสมัย (Decades)</span>
        </button>
      </div>

      {/* Quick Search Input */}
      <div className="w-full max-w-md mb-6 relative">
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
            placeholder="ค้นหาชื่อศิลปิน (เช่น Illslick, Bodyslam, Taylor Swift)..."
            className="w-full bg-transparent border-0 outline-none text-base sm:text-sm font-semibold placeholder:opacity-50"
            style={{ color: 'var(--song-text)' }}
          />
          {isSearchingRemote ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-emerald-400" />
          ) : searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-1 rounded-full hover:bg-white/10 shrink-0"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Tab: Artists */}
      {selectedTab === 'artists' && (
        <div className="w-full space-y-4">
          <div
            className="p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
            }}
          >
            <div>
              <h3 className="text-sm font-extrabold flex items-center gap-1.5">
                <span>ทายเพลงเฉพาะศิลปินคนโปรด</span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  ({displayArtists.length} ศิลปิน)
                </span>
              </h3>
              <p className="text-xs opacity-75 mt-0.5" style={{ color: 'var(--song-muted)' }}>
                เลือกศิลปินเพื่อทายเฉพาะเพลงในผลงานของศิลปินท่านนั้น หรือค้นหาชื่อศิลปินใดๆ ได้ทันที
              </p>
            </div>

            {/* Category Filter Pills (ทั้งหมด / เพลงไทย / สากล) */}
            <div
              className="flex items-center gap-1 p-1 rounded-xl border shrink-0"
              style={{
                backgroundColor: 'var(--song-surface-soft)',
                borderColor: 'var(--song-border)',
              }}
            >
              <button
                type="button"
                onClick={() => setArtistCategoryFilter('all')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold transition"
                style={
                  artistCategoryFilter === 'all'
                    ? {
                        backgroundColor: 'var(--song-accent)',
                        color: 'var(--song-accent-on)',
                      }
                    : { color: 'var(--song-muted)' }
                }
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => setArtistCategoryFilter('thai')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1"
                style={
                  artistCategoryFilter === 'thai'
                    ? {
                        backgroundColor: 'var(--song-accent)',
                        color: 'var(--song-accent-on)',
                      }
                    : { color: 'var(--song-muted)' }
                }
              >
                <span>🇹🇭 เพลงไทย</span>
              </button>
              <button
                type="button"
                onClick={() => setArtistCategoryFilter('international')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1"
                style={
                  artistCategoryFilter === 'international'
                    ? {
                        backgroundColor: 'var(--song-accent)',
                        color: 'var(--song-accent-on)',
                      }
                    : { color: 'var(--song-muted)' }
                }
              >
                <span>🌍 เพลงสากล</span>
              </button>
            </div>
          </div>

          {/* Grid of Artist Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {displayArtists.map((art) => (
              <button
                key={art.id + art.name}
                type="button"
                onClick={() => handleLaunchQuiz('standard', { artist: art.name })}
                className="p-2.5 sm:p-3 rounded-xl border text-left flex items-center gap-2.5 transition hover:scale-[1.02] hover:border-[var(--song-accent)] group"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                }}
              >
                {/* Artist Photo Avatar (Replaces mic icon) */}
                <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden shrink-0 border border-white/10 bg-neutral-800 shadow-sm">
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
                  <div className="font-extrabold text-xs sm:text-sm truncate group-hover:text-[var(--song-accent-text)]">
                    {art.name}
                  </div>
                  <div className="text-[10px] opacity-60 truncate">
                    {art.mainGenre || (art.category === 'thai' ? 'เพลงไทย' : 'สากล')}
                  </div>
                </div>
              </button>
            ))}

            {displayArtists.length === 0 && !isSearchingRemote && (
              <div
                className="col-span-full p-8 text-center rounded-2xl border text-xs sm:text-sm space-y-1"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-muted)',
                }}
              >
                <p className="font-bold text-white">ไม่พบศิลปินที่ตรงกับ &ldquo;{searchQuery}&rdquo;</p>
                <p className="text-xs">
                  ลองพิมพ์ชื่อภาษาไทยหรืออังกฤษอย่างน้อย 2 ตัวอักษร เพื่อให้ระบบค้นหาจาก iTunes โดยอัตโนมัติ
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Genres */}
      {selectedTab === 'genres' && (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
              className="p-4 rounded-2xl border flex flex-col justify-between transition hover:border-[var(--song-accent)]"
              style={{
                backgroundColor: 'var(--song-surface)',
                borderColor: 'var(--song-border)',
              }}
            >
              <div>
                <div className="flex items-center gap-2 text-xl mb-1.5">
                  <span>{g.icon}</span>
                  <span className="font-extrabold text-base">{g.name}</span>
                </div>
                <p className="text-xs opacity-75 line-clamp-2" style={{ color: 'var(--song-muted)' }}>
                  {g.desc}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--song-border)]">
                <button
                  type="button"
                  onClick={() => handleLaunchQuiz('standard', { genre: g.name })}
                  className="flex-1 py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition hover:brightness-110 shadow-sm"
                  style={{
                    backgroundColor: 'var(--song-accent)',
                    color: 'var(--song-accent-on)',
                  }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Clip Play</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLaunchQuiz('guesser', { genre: g.name })}
                  className="py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition hover:brightness-110"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                    color: 'var(--song-text)',
                  }}
                  title="เล่นโหมด 4 ตัวเลือก"
                >
                  <ListChecks className="w-3.5 h-3.5 text-purple-400" />
                  <span>4 ช้อยส์</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Eras */}
      {selectedTab === 'eras' && (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
              className="p-4 rounded-2xl border flex flex-col justify-between transition hover:border-[var(--song-accent)]"
              style={{
                backgroundColor: 'var(--song-surface)',
                borderColor: 'var(--song-border)',
              }}
            >
              <div>
                <div className="flex items-center gap-2 text-lg mb-1.5">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  <span className="font-extrabold text-base">{e.label}</span>
                </div>
                <p className="text-xs opacity-75 line-clamp-2" style={{ color: 'var(--song-muted)' }}>
                  {e.desc}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--song-border)]">
                <button
                  type="button"
                  onClick={() => handleLaunchQuiz('standard', { year: e.value })}
                  className="flex-1 py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition hover:brightness-110 shadow-sm"
                  style={{
                    backgroundColor: 'var(--song-accent)',
                    color: 'var(--song-accent-on)',
                  }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>ทายเพลง {e.label}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleLaunchQuiz('guesser', { year: e.value })}
                  className="py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition hover:brightness-110"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                    color: 'var(--song-text)',
                  }}
                  title="เล่นโหมด 4 ตัวเลือก"
                >
                  <ListChecks className="w-3.5 h-3.5 text-purple-400" />
                  <span>4 ช้อยส์</span>
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

