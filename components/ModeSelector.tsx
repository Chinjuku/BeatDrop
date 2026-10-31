'use client';

import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  Music,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Artist,
  CategoryType,
  DECADE_OPTIONS,
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  GENRE_OPTIONS,
  GameConfig,
  YEAR_OPTIONS,
} from '../types';
import { TimeRangeSelector } from './TimeRangeSelector';

interface ModeSelectorProps {
  config: GameConfig;
  onChangeConfig: (next: GameConfig, startImmediately?: boolean) => void;
  artists: Artist[];
  category: CategoryType;
  poolSize: number;
  onReroll: () => void;
  onOpenAddArtist?: () => void;
}

const REEL_OFFSETS = [-2, -1, 0, 1, 2];

interface FilterReelRowProps {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onSelect: (val: string) => void;
  onOpenPicker?: () => void;
  actionTitle?: string;
  actionIcon?: React.ReactNode;
}

const FilterReelRow: React.FC<FilterReelRowProps> = ({
  label,
  options,
  value,
  onSelect,
  onOpenPicker,
  actionTitle,
  actionIcon,
}) => {
  const [rollingDir, setRollingDir] = useState<'forward' | 'backward' | null>(null);
  const currentIdx = Math.max(
    0,
    options.findIndex((o) => o.value.toLowerCase() === (value || 'any').toLowerCase())
  );

  return (
    <section className="songspot-filter-row" aria-label={label}>
      <button
        type="button"
        onClick={onOpenPicker}
        className="songspot-filter-label group"
        title={actionTitle || label}
        style={{ cursor: onOpenPicker ? 'pointer' : 'default', pointerEvents: 'auto' }}
      >
        <span className="truncate group-hover:text-emerald-400 transition-colors">{label}</span>
      </button>

      <div
        className={`songspot-filter-values${rollingDir ? ` is-rolling-${rollingDir}` : ''}`}
        onAnimationEnd={(e) => {
          if (e.animationName.startsWith('songspot-filter-roll-')) {
            setRollingDir(null);
          }
        }}
      >
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

      {onOpenPicker && (
        <button
          type="button"
          onClick={onOpenPicker}
          className="songspot-filter-action"
          title={actionTitle}
          aria-label={actionTitle}
        >
          {actionIcon || <SlidersHorizontal className="w-3.5 h-3.5" />}
        </button>
      )}
    </section>
  );
};

/* -------------------------------------------------------------------------- */
/* Modal 1: All Genres Picker Modal                                           */
/* -------------------------------------------------------------------------- */
const GenrePickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  selectedGenre: string;
  onSelectGenre: (genre: string) => void;
}> = ({ isOpen, onClose, selectedGenre, onSelectGenre }) => {
  const [search, setSearch] = useState('');
  if (!isOpen) return null;

  const filteredGenres = GENRE_OPTIONS.filter((g) =>
    g.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-md rounded-2xl border p-4 sm:p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
          color: 'var(--song-text)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-extrabold tracking-wide">เลือกแนวเพลง (All Genres)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาแนวเพลง (เช่น Pop, Rock, Indie, T-Pop)..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border text-xs font-medium focus:outline-none"
            style={{
              backgroundColor: 'var(--song-surface-soft)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          />
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
        </div>

        <div className="overflow-y-auto flex-1 pr-1 space-y-2">
          {/* Option: Any genre */}
          <button
            type="button"
            onClick={() => {
              onSelectGenre('any');
              onClose();
            }}
            className="w-full p-2.5 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition hover:brightness-110"
            style={
              !selectedGenre || selectedGenre === 'any'
                ? {
                    backgroundColor: 'color-mix(in srgb, var(--song-accent) 18%, var(--song-surface-soft))',
                    borderColor: 'var(--song-accent)',
                    color: 'var(--song-accent-text)',
                  }
                : {
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                  }
            }
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Any genre (สุ่มทุกแนวเพลง)
            </span>
            {(!selectedGenre || selectedGenre === 'any') && (
              <Check className="w-4 h-4 text-emerald-400" />
            )}
          </button>

          {/* Grid of genres */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
            {filteredGenres
              .filter((g) => g !== 'any')
              .map((genre) => {
                const active = selectedGenre.toLowerCase() === genre.toLowerCase();
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => {
                      onSelectGenre(genre);
                      onClose();
                    }}
                    className="p-2 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition hover:brightness-110"
                    style={
                      active
                        ? {
                            backgroundColor: 'color-mix(in srgb, var(--song-accent) 18%, var(--song-surface-soft))',
                            borderColor: 'var(--song-accent)',
                            color: 'var(--song-accent-text)',
                          }
                        : {
                            backgroundColor: 'var(--song-surface-soft)',
                            borderColor: 'var(--song-border)',
                          }
                    }
                  >
                    <span className="truncate">{genre}</span>
                    {active && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Modal 2: All Eras & Years Picker Modal                                     */
/* -------------------------------------------------------------------------- */
const EraPickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  selectedEra: string;
  onSelectEra: (era: string) => void;
}> = ({ isOpen, onClose, selectedEra, onSelectEra }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-md rounded-2xl border p-4 sm:p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
          color: 'var(--song-text)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-extrabold tracking-wide">เลือกปีหรือทศวรรษ (All Eras & Years)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 pr-1 space-y-4">
          {/* Any era */}
          <button
            type="button"
            onClick={() => {
              onSelectEra('any');
              onClose();
            }}
            className="w-full p-2.5 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition hover:brightness-110"
            style={
              !selectedEra || selectedEra === 'any'
                ? {
                    backgroundColor: 'color-mix(in srgb, var(--song-accent) 18%, var(--song-surface-soft))',
                    borderColor: 'var(--song-accent)',
                    color: 'var(--song-accent-text)',
                  }
                : {
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                  }
            }
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Any era (สุ่มทุกยุคสมัย)
            </span>
            {(!selectedEra || selectedEra === 'any') && (
              <Check className="w-4 h-4 text-emerald-400" />
            )}
          </button>

          {/* Decades */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              ทศวรรษ (Decades)
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DECADE_OPTIONS.map((dec) => {
                const active = selectedEra === dec;
                return (
                  <button
                    key={dec}
                    type="button"
                    onClick={() => {
                      onSelectEra(dec);
                      onClose();
                    }}
                    className="p-2 rounded-xl border text-center text-xs font-bold transition hover:brightness-110"
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
                    {dec === 'classic' ? 'Classic' : dec}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exact Years 2026 down to 2000 */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              เจาะจงปีที่ปล่อยเพลง (Exact Years: 2000 – 2026)
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {YEAR_OPTIONS.map((yr) => {
                const active = selectedEra === yr;
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => {
                      onSelectEra(yr);
                      onClose();
                    }}
                    className="py-1.5 px-2 rounded-lg border text-center text-[11px] font-bold transition hover:brightness-110"
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
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Main ModeSelector Component                                                */
/* -------------------------------------------------------------------------- */
export const ModeSelector: React.FC<ModeSelectorProps> = ({
  config,
  onChangeConfig,
  artists,
  category,
  onOpenAddArtist,
}) => {
  const [genreModalOpen, setGenreModalOpen] = useState(false);
  const [eraModalOpen, setEraModalOpen] = useState(false);

  const handleDifficultySelect = (diff: DifficultyLevel) => {
    onChangeConfig({ ...config, difficulty: diff }, true);
  };

  // Genre reel options
  const genreReelOptions = useMemo(() => {
    const opts = [
      { value: 'any', label: 'Any genre' },
      ...GENRE_OPTIONS.filter((g) => g !== 'any').map((g) => ({ value: g, label: g })),
    ];
    if (
      config.genreFilter &&
      config.genreFilter !== 'any' &&
      !opts.some((o) => o.value.toLowerCase() === config.genreFilter?.toLowerCase())
    ) {
      opts.push({ value: config.genreFilter, label: config.genreFilter });
    }
    return opts;
  }, [config.genreFilter]);

  // Era reel options
  const eraReelOptions = useMemo(() => {
    const opts = [
      { value: 'any', label: 'Any era' },
      ...DECADE_OPTIONS.map((d) => ({
        value: d,
        label: d === 'classic' ? 'Classic' : d,
      })),
      ...YEAR_OPTIONS.slice(0, 10).map((y) => ({
        value: String(y),
        label: String(y),
      })),
    ];
    if (
      config.yearFilter &&
      config.yearFilter !== 'any' &&
      !opts.some((o) => o.value === config.yearFilter)
    ) {
      opts.push({ value: config.yearFilter, label: config.yearFilter });
    }
    return opts;
  }, [config.yearFilter]);

  // Artist reel options
  const filteredPoolArtists = useMemo(() => {
    return artists.filter((a) => (category === 'all' ? true : a.category === category));
  }, [artists, category]);

  const artistReelOptions = useMemo(() => {
    const opts = [
      { value: 'any', label: 'Any artist' },
      ...filteredPoolArtists.map((a) => ({ value: a.name, label: a.name })),
    ];
    if (
      config.artistName &&
      config.artistName !== 'any' &&
      !opts.some((o) => o.value.toLowerCase() === config.artistName?.toLowerCase())
    ) {
      opts.push({ value: config.artistName, label: config.artistName });
    }
    return opts;
  }, [filteredPoolArtists, config.artistName]);

  const difficultyList: DifficultyLevel[] = ['easy', 'medium', 'hard', 'expert', 'impossible'];

  return (
    <div className="w-full max-w-2xl mx-auto mb-5 space-y-3 relative z-10">
      {/* Exact Songspot 3-Row Filter Reels + 5 Difficulty Tabs */}
      <div className="pt-1 pb-2">
        <div className="songspot-filter-stack">
          {/* Indicator Arrow at Top of Filter Reel */}
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

          {/* Row 1: GENRES */}
          <FilterReelRow
            label="GENRES"
            options={genreReelOptions}
            value={config.genreFilter || 'any'}
            onSelect={(val) =>
              onChangeConfig({ ...config, genreFilter: val, mode: 'standard' }, true)
            }
            onOpenPicker={() => setGenreModalOpen(true)}
            actionTitle="เลือกแนวเพลงทั้งหมด (All Genres)"
            actionIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
          />

          {/* Row 2: ERAS */}
          <FilterReelRow
            label="ERAS"
            options={eraReelOptions}
            value={config.yearFilter || 'any'}
            onSelect={(val) =>
              onChangeConfig({ ...config, yearFilter: val, mode: 'standard' }, true)
            }
            onOpenPicker={() => setEraModalOpen(true)}
            actionTitle="เลือกปีและทศวรรษทั้งหมด (All Eras & Years)"
            actionIcon={<Calendar className="w-3.5 h-3.5" />}
          />

          {/* Row 3: ARTISTS */}
          <FilterReelRow
            label="ARTISTS"
            options={artistReelOptions}
            value={config.artistName || 'any'}
            onSelect={(val) =>
              onChangeConfig(
                {
                  ...config,
                  artistName: val === 'any' ? undefined : val,
                  mode: 'standard',
                },
                true
              )
            }
            onOpenPicker={onOpenAddArtist}
            actionTitle="เลือกหรือค้นหาศิลปินทั้งหมด (All Artists & Add Artist)"
            actionIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
          />
        </div>

        {/* 5 Difficulty Tabs + Time Range Selector */}
        <div className="flex flex-col items-center justify-center gap-2.5 mt-4 pt-1 w-full">
          {/* Row 1: ระดับความยาก (5 Difficulty Tabs) */}
          <div className="songspot-difficulty-tabs w-full justify-center">
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

          {/* Row 2: Time Range Preset */}
          <div className="w-full flex items-center justify-center">
            <TimeRangeSelector
              currentPreset={config.timeRangePreset}
              stages={config.customStages}
              onChangePreset={(presetId, stages) => {
                onChangeConfig(
                  {
                    ...config,
                    timeRangePreset: presetId,
                    customStages: stages,
                  },
                  true
                );
              }}
            />
          </div>
        </div>
      </div>

      {/* Genre Picker Modal */}
      <GenrePickerModal
        isOpen={genreModalOpen}
        onClose={() => setGenreModalOpen(false)}
        selectedGenre={config.genreFilter || 'any'}
        onSelectGenre={(genre) => {
          onChangeConfig({ ...config, genreFilter: genre, mode: 'standard' }, true);
        }}
      />

      {/* Era Picker Modal */}
      <EraPickerModal
        isOpen={eraModalOpen}
        onClose={() => setEraModalOpen(false)}
        selectedEra={config.yearFilter || 'any'}
        onSelectEra={(era) => {
          onChangeConfig({ ...config, yearFilter: era, mode: 'standard' }, true);
        }}
      />
    </div>
  );
};
