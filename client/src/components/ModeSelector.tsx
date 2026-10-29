import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Disc,
  ListChecks,
  Mic2,
  Music,
  Play,
  Search,
  Sparkles,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import {
  Artist,
  CategoryType,
  DECADE_OPTIONS,
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  GENRE_OPTIONS,
  GameConfig,
  GameMode,
  YEAR_OPTIONS,
} from '../../../shared/types';

interface ModeSelectorProps {
  config: GameConfig;
  onChangeConfig: (next: GameConfig, startImmediately?: boolean) => void;
  artists: Artist[];
  category: CategoryType;
  poolSize: number;
  onReroll: () => void;
}

const REEL_OFFSETS = [-2, -1, 0, 1, 2];

interface FilterReelRowProps {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onSelect: (val: string) => void;
}

const FilterReelRow: React.FC<FilterReelRowProps> = ({
  label,
  options,
  value,
  onSelect,
}) => {
  const [rollingDir, setRollingDir] = useState<'forward' | 'backward' | null>(null);
  const currentIdx = Math.max(
    0,
    options.findIndex((o) => o.value.toLowerCase() === (value || 'any').toLowerCase())
  );

  return (
    <section className="songspot-filter-row" aria-label={label}>
      <span className="songspot-filter-label">{label}</span>
      <div
        className={`songspot-filter-values${rollingDir ? ` is-rolling-${rollingDir}` : ''}`}
        onAnimationEnd={(e) => {
          if (e.animationName.startsWith('songspot-filter-roll-')) {
            setRollingDir(null);
          }
        }}
      >
        <svg
          className="songspot-filter-indicator"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 18L4 6h16l-8 12z" />
        </svg>

        {REEL_OFFSETS.map((offset) => {
          if (options.length === 0 || (options.length === 1 && offset !== 0)) {
            return <span key={offset} data-offset={offset} />;
          }
          const opt = options[(currentIdx + offset + options.length) % options.length];
          const isCenter = offset === 0;
          return (
            <button
              key={`${offset}:${opt.value}`}
              type="button"
              data-offset={offset}
              aria-pressed={isCenter}
              aria-label={`${label}: ${opt.label}`}
              title={opt.label}
              onClick={() => {
                if (!isCenter && !rollingDir) {
                  setRollingDir(offset > 0 ? 'forward' : 'backward');
                  onSelect(opt.value);
                }
              }}
            >
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  config,
  onChangeConfig,
  artists,
  category,
  poolSize,
  onReroll,
}) => {
  const [artistQuery, setArtistQuery] = useState('');
  const [searchedArtists, setSearchedArtists] = useState<Artist[]>([]);
  const [searchingArtists, setSearchingArtists] = useState(false);
  const [pendingArtist, setPendingArtist] = useState<string>(config.artistName || '');

  useEffect(() => {
    if (config.artistName) {
      setPendingArtist(config.artistName);
    }
  }, [config.artistName]);

  // Debounced API + local artist search for Artist Mode Step 1
  useEffect(() => {
    if (config.mode !== 'artist') return;
    if (!artistQuery.trim()) {
      const filteredLocal = artists.filter((a) =>
        category === 'all' ? true : a.category === category
      );
      setSearchedArtists(filteredLocal);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingArtists(true);
      try {
        const res = await fetch(
          `/api/artists?category=${category}&q=${encodeURIComponent(artistQuery)}&discover=true`
        );
        const json = await res.json();
        if (json.code === 0) {
          setSearchedArtists(json.data || []);
        }
      } catch {
        // Fallback to local filter
        const qLower = artistQuery.toLowerCase();
        setSearchedArtists(
          artists.filter((a) => a.name.toLowerCase().includes(qLower))
        );
      } finally {
        setSearchingArtists(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [artistQuery, artists, category, config.mode]);

  const modes: Array<{ id: GameMode; label: string; icon: React.ReactNode }> = [
    { id: 'standard', label: 'โหมดทั่วไป (All Hits)', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'guesser', label: 'Song Guesser (4 ตัวเลือก)', icon: <ListChecks className="w-3.5 h-3.5" /> },
    { id: 'artist', label: 'ทายตามศิลปิน (Artist)', icon: <Mic2 className="w-3.5 h-3.5" /> },
    { id: 'year', label: 'ปีที่ปล่อยเพลง (Year/Era)', icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'genre', label: 'แนวเพลง (Genre)', icon: <Music className="w-3.5 h-3.5" /> },
  ];

  const handleDifficultySelect = (diff: DifficultyLevel) => {
    onChangeConfig({ ...config, difficulty: diff }, true);
  };

  const handleModeSwitch = (mode: GameMode) => {
    if (mode === 'standard') {
      onChangeConfig(
        {
          ...config,
          mode: 'standard',
          artistName: undefined,
          yearFilter: 'any',
          genreFilter: 'any',
        },
        true
      );
    } else if (mode === 'guesser') {
      onChangeConfig(
        {
          ...config,
          mode: 'guesser',
        },
        true
      );
    } else if (mode === 'artist') {
      const defaultArtist =
        config.artistName ||
        artists.find((a) => (category === 'all' ? true : a.category === category))?.name ||
        'Bodyslam';
      setPendingArtist(defaultArtist);
      onChangeConfig(
        {
          ...config,
          mode: 'artist',
          artistName: defaultArtist,
        },
        true
      );
    } else if (mode === 'year') {
      onChangeConfig(
        {
          ...config,
          mode: 'year',
          artistName: undefined,
          yearFilter: config.yearFilter && config.yearFilter !== 'any' ? config.yearFilter : '2020s',
        },
        true
      );
    } else if (mode === 'genre') {
      onChangeConfig(
        {
          ...config,
          mode: 'genre',
          artistName: undefined,
          genreFilter: config.genreFilter && config.genreFilter !== 'any' ? config.genreFilter : 'Pop',
        },
        true
      );
    }
  };

  // Options for the Songspot Default Mode 3-row filter reel
  const genreReelOptions = [
    { value: 'any', label: 'Any genre' },
    ...GENRE_OPTIONS.filter((g) => g !== 'any').map((g) => ({ value: g, label: g })),
  ];

  const eraReelOptions = [
    { value: 'any', label: 'Any era' },
    { value: 'classic', label: 'Classic' },
    { value: '1980s', label: '1980s' },
    { value: '1990s', label: '1990s' },
    { value: '2000s', label: '2000s' },
    { value: '2010s', label: '2010s' },
    { value: '2020s', label: '2020s' },
  ];

  const filteredPoolArtists = artists.filter((a) =>
    category === 'all' ? true : a.category === category
  );
  const artistReelOptions = [
    { value: 'any', label: 'Any artist' },
    ...filteredPoolArtists.map((a) => ({ value: a.name, label: a.name })),
  ];

  const difficultyList: DifficultyLevel[] = ['easy', 'medium', 'hard', 'expert', 'impossible'];

  return (
    <div className="w-full max-w-2xl mx-auto mb-5 space-y-3 relative z-10">
      {/* 1. Filter Mode Tabs (Keep Artist, Year, Genre modes intact!) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {modes.map((m) => {
          const active = config.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => handleModeSwitch(m.id)}
              className="px-3 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
              style={
                active
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--song-accent) 16%, var(--song-surface))',
                      borderColor: 'var(--song-accent)',
                      color: 'var(--song-accent-text)',
                    }
                  : {
                      backgroundColor: 'var(--song-surface)',
                      borderColor: 'var(--song-border)',
                      color: 'var(--song-muted)',
                    }
              }
            >
              {m.icon}
              <span className="truncate">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Default Mode (Standard) & Song Guesser: Exact Songspot 3-Row Filter Reels + 5 Difficulty Tabs */}
      {(config.mode === 'standard' || config.mode === 'guesser') && (
        <div className="pt-1 pb-2">
          <div className="songspot-filter-stack">
            <FilterReelRow
              label="GENRES"
              options={genreReelOptions}
              value={config.genreFilter || 'any'}
              onSelect={(val) =>
                onChangeConfig({ ...config, genreFilter: val }, true)
              }
            />
            <FilterReelRow
              label="ERAS"
              options={eraReelOptions}
              value={config.yearFilter || 'any'}
              onSelect={(val) =>
                onChangeConfig({ ...config, yearFilter: val }, true)
              }
            />
            <FilterReelRow
              label="ARTISTS"
              options={artistReelOptions}
              value={config.artistName || 'any'}
              onSelect={(val) =>
                onChangeConfig(
                  {
                    ...config,
                    artistName: val === 'any' ? undefined : val,
                  },
                  true
                )
              }
            />
          </div>

          <div className="songspot-difficulty-tabs mt-3">
            {difficultyList.map((lvl) => {
              const preset = DIFFICULTY_PRESETS[lvl];
              const isSelected = config.difficulty === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  className="songspot-difficulty-tab"
                  aria-pressed={isSelected}
                  style={
                    {
                      '--tab-color': preset.accent,
                      '--tab-text': preset.accentText,
                      '--tab-on': preset.accentOn,
                    } as React.CSSProperties
                  }
                  onClick={() => handleDifficultySelect(lvl)}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Difficulty Bar for Specialized Modes (Artist / Year / Genre) */}
      {config.mode !== 'standard' && config.mode !== 'guesser' && config.mode !== 'daily' && (
        <div
          className="p-3 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
          }}
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
            <Disc className="w-4 h-4" style={{ color: 'var(--song-accent-text)' }} />
            <span>ระดับความยาก (Difficulty):</span>
          </div>

          <div className="songspot-difficulty-tabs !w-auto">
            {difficultyList.map((lvl) => {
              const preset = DIFFICULTY_PRESETS[lvl];
              const isSelected = config.difficulty === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  className="songspot-difficulty-tab"
                  aria-pressed={isSelected}
                  style={
                    {
                      '--tab-color': preset.accent,
                      '--tab-text': preset.accentText,
                      '--tab-on': preset.accentOn,
                    } as React.CSSProperties
                  }
                  onClick={() => handleDifficultySelect(lvl)}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Sub-Mode Interactive Panels */}
      {config.mode === 'artist' && (
        <div
          className="p-4 rounded-2xl border space-y-3"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--song-accent-text)' }}>
                โหมดทายตามศิลปิน (Scoped Artist Mode)
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--song-muted)' }}>
                Step 1: ค้นหาและเลือกศิลปิน • Step 2: เลือกระดับความยาก • Step 3: ทายเฉพาะเพลงของศิลปินนั้น!
              </p>
            </div>
            {config.artistName && (
              <span
                className="px-3 py-1 rounded-full text-xs font-extrabold self-start sm:self-auto"
                style={{
                  backgroundColor: 'var(--song-accent)',
                  color: 'var(--song-accent-on)',
                }}
              >
                🎤 กำลังเล่น: {config.artistName} ({poolSize} เพลง)
              </span>
            )}
          </div>

          {/* Step 1: Artist Search Input */}
          <div className="relative">
            <input
              type="text"
              value={artistQuery}
              onChange={(e) => setArtistQuery(e.target.value)}
              placeholder="ค้นหาชื่อศิลปินไทยหรือสากล (เช่น Bodyslam, Three Man Down, Taylor Swift, Queen)..."
              className="w-full pl-9 pr-9 py-2 rounded-xl border text-xs font-medium focus:outline-none"
              style={{
                backgroundColor: 'var(--song-surface-soft)',
                borderColor: 'var(--song-border)',
                color: 'var(--song-text)',
              }}
            />
            <Search className="w-4 h-4 absolute left-3 top-2.5" style={{ color: 'var(--song-muted)' }} />
            {searchingArtists && (
              <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-2.5" style={{ color: 'var(--song-accent-text)' }} />
            )}
          </div>

          {/* Step 2: Artist Selection Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
            {searchedArtists.map((artist) => {
              const selected =
                (pendingArtist || config.artistName)?.toLowerCase() === artist.name.toLowerCase();
              return (
                <button
                  key={artist.id + artist.name}
                  type="button"
                  onClick={() => {
                    setPendingArtist(artist.name);
                    onChangeConfig(
                      {
                        ...config,
                        mode: 'artist',
                        artistName: artist.name,
                      },
                      true
                    );
                  }}
                  className="p-2 rounded-xl border text-left flex items-center gap-2 transition hover:brightness-110"
                  style={
                    selected
                      ? {
                          backgroundColor: 'color-mix(in srgb, var(--song-accent) 18%, var(--song-surface-soft))',
                          borderColor: 'var(--song-accent)',
                        }
                      : {
                          backgroundColor: 'var(--song-surface-soft)',
                          borderColor: 'var(--song-border)',
                        }
                  }
                >
                  <img
                    src={artist.avatarUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120'}
                    alt={artist.name}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">{artist.name}</div>
                    <div className="text-[10px] truncate" style={{ color: 'var(--song-muted)' }}>
                      {artist.category === 'thai' ? '🇹🇭' : '🌍'} {artist.mainGenre}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Step 3: Start / Reroll Artist Game */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px]" style={{ color: 'var(--song-muted)' }}>
              ระบบจำกัดตัวเลือกคำตอบเฉพาะเพลงของ <strong>{config.artistName || pendingArtist}</strong> เท่านั้น
            </span>
            <button
              type="button"
              onClick={() =>
                onChangeConfig(
                  {
                    ...config,
                    mode: 'artist',
                    artistName: pendingArtist || config.artistName,
                  },
                  true
                )
              }
              className="px-4 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition hover:brightness-110"
              style={{
                backgroundColor: 'var(--song-accent)',
                color: 'var(--song-accent-on)',
              }}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>เริ่มสุ่มเพลงของ {pendingArtist || config.artistName}</span>
            </button>
          </div>
        </div>
      )}

      {config.mode === 'year' && (
        <div
          className="p-4 rounded-2xl border space-y-3"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--song-accent-text)' }}>
              เลือกตามทศวรรษ หรือ ปีที่ปล่อยเพลง (2000 – 2026)
            </span>
            <span className="text-xs font-semibold" style={{ color: 'var(--song-muted)' }}>
              กำลังกรอง: <strong style={{ color: 'var(--song-text)' }}>{config.yearFilter || 'All'}</strong>
            </span>
          </div>

          {/* Decade Quick Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold mr-1" style={{ color: 'var(--song-muted)' }}>
              ทศวรรษ:
            </span>
            {DECADE_OPTIONS.map((dec) => {
              const active = config.yearFilter === dec;
              return (
                <button
                  key={dec}
                  type="button"
                  onClick={() => onChangeConfig({ ...config, mode: 'year', yearFilter: dec }, true)}
                  className="px-3 py-1 rounded-lg text-xs font-bold border transition"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                          borderColor: 'var(--song-accent)',
                        }
                      : {
                          backgroundColor: 'var(--song-surface-soft)',
                          borderColor: 'var(--song-border)',
                          color: 'var(--song-text)',
                        }
                  }
                >
                  ยุค {dec}
                </button>
              );
            })}
          </div>

          {/* Exact Years 2026 down to 2000 */}
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pt-1">
            {YEAR_OPTIONS.map((yr) => {
              const active = config.yearFilter === yr;
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => onChangeConfig({ ...config, mode: 'year', yearFilter: yr }, true)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                          borderColor: 'var(--song-accent)',
                        }
                      : {
                          backgroundColor: 'var(--song-surface-soft)',
                          borderColor: 'var(--song-border)',
                          color: 'var(--song-muted)',
                        }
                  }
                >
                  {yr}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {config.mode === 'genre' && (
        <div
          className="p-4 rounded-2xl border space-y-2.5"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--song-accent-text)' }}>
              เลือกแนวเพลง (Genre Filter)
            </span>
            <button
              type="button"
              onClick={onReroll}
              className="text-[11px] font-bold flex items-center gap-1 hover:underline"
              style={{ color: 'var(--song-accent-text)' }}
            >
              <RotateCcw className="w-3 h-3" />
              สุ่มเพลงใหม่ในแนวนี้
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {GENRE_OPTIONS.filter((g) => g !== 'any').map((genre) => {
              const active = config.genreFilter === genre;
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() =>
                    onChangeConfig({ ...config, mode: 'genre', genreFilter: genre }, true)
                  }
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold border transition"
                  style={
                    active
                      ? {
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                          borderColor: 'var(--song-accent)',
                        }
                      : {
                          backgroundColor: 'var(--song-surface-soft)',
                          borderColor: 'var(--song-border)',
                          color: 'var(--song-text)',
                        }
                  }
                >
                  {genre}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

