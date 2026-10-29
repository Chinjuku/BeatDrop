import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Flame,
  Globe,
  Palette,
  PlusCircle,
  Trophy,
  Zap,
  Check,
} from 'lucide-react';
import { CategoryType, THEME_PRESETS, ThemeId } from '../../../shared/types';
import { useTheme } from '../context/ThemeContext';
import { BeatDropLogo } from './BeatDropLogo';

interface NavbarProps {
  category: CategoryType;
  onCategoryChange: (cat: CategoryType) => void;
  streak: number;
  bestStreak: number;
  fastestTime: number | null;
  onOpenAddArtist: () => void;
  artistCount: number;
  isDailyMode: boolean;
  onToggleDailyMode: () => void;
  onOpenLeaderboard: () => void;
  onHomeClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  category,
  onCategoryChange,
  streak,
  bestStreak,
  fastestTime,
  onOpenAddArtist,
  artistCount,
  isDailyMode,
  onToggleDailyMode,
  onOpenLeaderboard,
  onHomeClick,
}) => {
  const {
    themeId,
    setThemeId,
    syncDifficultyAccent,
    setSyncDifficultyAccent,
  } = useTheme();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const categories: Array<{ id: CategoryType; label: string; badge: string }> = [
    { id: 'thai', label: 'เพลงไทย', badge: '🇹🇭' },
    { id: 'international', label: 'เพลงสากล', badge: '🌍' },
    { id: 'all', label: 'Mixed รวมฮิต', badge: '🔥' },
  ];

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md transition-colors"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--song-page) 86%, transparent)',
        borderColor: 'var(--song-border)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand Logo & Home Action */}
        <button
          type="button"
          onClick={onHomeClick}
          className="flex items-center gap-3 text-left transition hover:opacity-90 focus:outline-none"
          title="หน้าหลัก BeatDrop (Home)"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md p-1.5"
            style={{
              backgroundColor: 'var(--song-accent)',
              color: 'var(--song-accent-on)',
            }}
          >
            <BeatDropLogo className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-normal italic pr-1 bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                BeatDrop
              </span>
              <span
                className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'var(--song-accent)',
                  color: 'var(--song-accent-on)',
                }}
              >
                TH & INTL
              </span>
            </div>
            <p className="text-xs hidden sm:block font-medium" style={{ color: 'var(--song-muted)' }}>
              ทายเพลงไทย & สากล จากเสี้ยววินาที
            </p>
          </div>
        </button>

        {/* Primary Category Toggle: Thai vs International vs Mixed */}
        <div
          className="flex items-center p-1 rounded-xl border"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
          }}
          role="group"
          aria-label="Primary Song Category"
        >
          {categories.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryChange(cat.id)}
                className="px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5"
                style={
                  active
                    ? {
                        backgroundColor: 'var(--song-accent)',
                        color: 'var(--song-accent-on)',
                        boxShadow: '0 0 16px rgba(var(--song-accent-rgb), 0.3)',
                      }
                    : {
                        color: 'var(--song-muted)',
                      }
                }
              >
                <span>{cat.badge}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Actions: Stats, Add Artist, Theme Picker */}
        <div className="flex items-center gap-2">
          {/* Stats Pills */}
          <div
            className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-xl border text-xs font-semibold"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
            }}
          >
            <span className="flex items-center gap-1" title="Current Win Streak">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>Streak: {streak}</span>
            </span>
            <span className="opacity-30">|</span>
            <span className="flex items-center gap-1" title="Best Win Streak">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Best: {bestStreak}</span>
            </span>
            {fastestTime !== null && (
              <>
                <span className="opacity-30">|</span>
                <span className="flex items-center gap-1" title="Fastest Guess Time">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{fastestTime}s</span>
                </span>
              </>
            )}
          </div>

          {/* Daily Challenge Button */}
          <button
            type="button"
            onClick={onToggleDailyMode}
            className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition hover:brightness-110"
            style={
              isDailyMode
                ? {
                    backgroundColor: 'var(--song-accent)',
                    borderColor: 'var(--song-accent)',
                    color: 'var(--song-accent-on)',
                    boxShadow: '0 0 16px rgba(var(--song-accent-rgb), 0.35)',
                  }
                : {
                    backgroundColor: 'var(--song-surface)',
                    borderColor: 'var(--song-border)',
                    color: 'var(--song-text)',
                  }
            }
          >
            <CalendarDays
              className="w-4 h-4"
              style={{
                color: isDailyMode ? 'var(--song-accent-on)' : 'var(--song-accent-text)',
              }}
            />
            <span>Daily Challenge</span>
          </button>

          {/* Leaderboard Button */}
          <button
            type="button"
            onClick={onOpenLeaderboard}
            className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition hover:brightness-110"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Leaderboard</span>
          </button>

          {/* Add / Manage Artists Button */}
          <button
            type="button"
            onClick={onOpenAddArtist}
            className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition hover:brightness-110"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            <PlusCircle className="w-4 h-4" style={{ color: 'var(--song-accent-text)' }} />
            <span className="hidden sm:inline">เพิ่ม/จัดการศิลปิน</span>
            <span
              className="px-1.5 py-0.2 rounded-full text-[10px]"
              style={{
                backgroundColor: 'var(--song-surface-soft)',
                color: 'var(--song-accent-text)',
              }}
            >
              {artistCount}
            </span>
          </button>

          {/* Theme Switcher Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setThemeMenuOpen((o) => !o)}
              className="p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition hover:brightness-110"
              style={{
                backgroundColor: 'var(--song-surface)',
                borderColor: 'var(--song-border)',
                color: 'var(--song-text)',
              }}
              aria-label="Change color theme"
              aria-expanded={themeMenuOpen}
            >
              <Palette className="w-4 h-4" style={{ color: 'var(--song-accent-text)' }} />
              <span className="hidden lg:inline">{THEME_PRESETS[themeId].name}</span>
            </button>

            {themeMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-72 rounded-2xl border p-2 shadow-2xl z-50"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              >
                <div
                  className="px-3 py-2 text-xs font-bold border-b mb-1 flex items-center justify-between"
                  style={{ borderColor: 'var(--song-border)', color: 'var(--song-muted)' }}
                >
                  <span>THEME SYSTEM</span>
                  <Globe className="w-3.5 h-3.5" />
                </div>

                <div className="space-y-1">
                  {(Object.keys(THEME_PRESETS) as ThemeId[]).map((id) => {
                    const preset = THEME_PRESETS[id];
                    const selected = themeId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setThemeId(id);
                        }}
                        className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-3 transition"
                        style={{
                          backgroundColor: selected ? 'var(--song-surface-soft)' : 'transparent',
                        }}
                      >
                        <span
                          className="w-5 h-5 rounded-full flex-shrink-0 border border-white/20 shadow-sm"
                          style={{ backgroundColor: preset.accent }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">{preset.name}</div>
                          <div
                            className="text-[10px] truncate"
                            style={{ color: 'var(--song-muted)' }}
                          >
                            {preset.description}
                          </div>
                        </div>
                        {selected && (
                          <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--song-accent-text)' }} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {themeId === 'songspot-dark' && (
                  <label
                    className="mt-2 pt-2 border-t px-3 py-1.5 flex items-center justify-between text-[11px] cursor-pointer"
                    style={{ borderColor: 'var(--song-border)', color: 'var(--song-muted)' }}
                  >
                    <span>เปลี่ยนสีไฟตามระดับความยาก (Songspot GI)</span>
                    <input
                      type="checkbox"
                      checked={syncDifficultyAccent}
                      onChange={(e) => setSyncDifficultyAccent(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

