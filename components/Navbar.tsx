'use client';
import { Link, usePathname, useRouter } from '../i18n/navigation';
import { saveLocalePreference } from '../i18n/localePreference';
import React, { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { routing, type AppLocale } from '../i18n/routing';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Compass,
  Flame,
  Globe,
  ListChecks,
  Menu,
  Music,
  Palette,
  Play,
  PlusCircle,
  Search,
  Settings,
  Shield,
  Sparkles,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { CategoryType, GameMode, THEME_PRESETS, ThemeId } from '../types';
import { useTheme } from '../context/ThemeContext';
import { BeatDropLogo } from './BeatDropLogo';
import { Modal } from './Modal';

export interface NavbarProps {
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
  currentMode?: GameMode;
  onSelectQuiz?: (
    mode: GameMode,
    filters?: { artist?: string; year?: string; genre?: string }
  ) => void;
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
  currentMode = 'standard',
  onSelectQuiz,
}) => {
  const t = useTranslations('Navbar');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname() || '/play';

  // Keeps the current path and query string. Read from window at click time rather than
  // useSearchParams, which would force a Suspense boundary around the root shell.
  const switchLocale = (next: AppLocale) => {
    setActiveMenu(null);
    if (next === locale) return;
    const search = typeof window !== 'undefined' ? window.location.search : '';
    // Save before navigating so middleware sees the new choice on this very request.
    saveLocalePreference(next);
    router.replace(`${pathname}${search}`, { locale: next });
  };

  const renderLanguageOptions = (buttonClassName: string) =>
    routing.locales.map((code) => {
      const selected = locale === code;
      return (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={selected}
          onClick={() => switchLocale(code)}
          className={buttonClassName}
          style={
            selected
              ? {
                  backgroundColor: 'color-mix(in srgb, var(--song-accent) 18%, var(--song-surface))',
                  color: 'var(--song-accent-text)',
                }
              : { color: 'var(--song-text)' }
          }
        >
          <span>{t(`languages.${code}`)}</span>
          {selected && <Check className="w-4 h-4 flex-shrink-0" aria-hidden="true" />}
        </button>
      );
    });
  const navigate = (path: string) => router.push(path);
  const location = { pathname };

  const isPlayActive = location.pathname === '/' || location.pathname === '/play';
  const isDailyActive = location.pathname === '/daily';
  const isGuesserActive = location.pathname === '/guesser';
  const isCategoriesActive =
    location.pathname === '/categories' || location.pathname === '/quizzes';

  const {
    themeId,
    setThemeId,
    syncDifficultyAccent,
    setSyncDifficultyAccent,
  } = useTheme();

  // Active dropdown menu: 'clip' | 'guesser' | 'locale' | 'settings' | 'mobile' | null
  const [activeMenu, setActiveMenu] = useState<
    'clip' | 'guesser' | 'locale' | 'settings' | 'mobile' | null
  >(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const headerRef = useRef<HTMLElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);

  // Close menus automatically whenever route changes (including browser Back/Forward)
  useEffect(() => {
    setActiveMenu(null);
  }, [pathname]);

  // Close menus on outside click or Escape key
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideHeader = Boolean(headerRef.current && headerRef.current.contains(target));
      const insideMobileDrawer = Boolean(
        mobileDrawerRef.current && mobileDrawerRef.current.contains(target)
      );
      if (!insideHeader && !insideMobileDrawer) {
        setActiveMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const categories: Array<{ id: CategoryType; label: string; badge: string }> = [
    { id: 'thai', label: t('catalog.thai'), badge: 'TH' },
    { id: 'international', label: t('catalog.international'), badge: 'INTL' },
    { id: 'all', label: t('catalog.all'), badge: 'ALL' },
  ];

  const currentCategoryObj =
    categories.find((c) => c.id === category) || categories[0];

  const topGenres = [
    'Pop',
    'T-Pop',
    'Rock',
    'Indie',
    'R&B',
    'Hip-Hop/Rap',
    'K-Pop',
    'EDM',
  ];

  const topEras = [
    { label: '2020s', value: '2020s' },
    { label: '2010s', value: '2010s' },
    { label: '2000s', value: '2000s' },
    { label: '1990s', value: '1990s' },
    { label: '1980s', value: '1980s' },
    { label: t('eraClassic'), value: 'classic' },
  ];

  const topArtists =
    category === 'thai'
      ? ['Bodyslam', 'Three Man Down', 'Cocktail', 'BOWKYLION', 'Potato', 'Nont Tanont', 'Jeff Satur', 'Tilly Birds']
      : category === 'international'
        ? ['Taylor Swift', 'Queen', 'Michael Jackson', 'The Weeknd', 'Drake', 'Bruno Mars', 'Ed Sheeran', 'Coldplay']
        : ['Bodyslam', 'Taylor Swift', 'Three Man Down', 'Queen', 'Cocktail', 'The Weeknd', 'Nont Tanont', 'Coldplay'];

  const handlePlayClipChallenge = () => {
    setActiveMenu(null);
    onSelectQuiz?.('standard');
  };

  const handlePlayMultipleChoice = () => {
    setActiveMenu(null);
    onSelectQuiz?.('guesser');
  };

  const handleSelectGenreQuiz = (mode: GameMode, genre: string) => {
    setActiveMenu(null);
    onSelectQuiz?.(mode, { genre });
  };

  const handleSelectEraQuiz = (mode: GameMode, year: string) => {
    setActiveMenu(null);
    onSelectQuiz?.(mode, { year });
  };

  const handleSelectArtistQuiz = (mode: GameMode, artist: string) => {
    setActiveMenu(null);
    onSelectQuiz?.(mode, { artist });
  };

  return (
    <header className="songspot-site-header" ref={headerRef}>
      <div className="songspot-site-header-inner">
        {/* Left: Brand / Home Link */}
        <Link
          href="/play"
          onClick={() => setActiveMenu(null)}
          className="songspot-site-brand group"
          title={t('homeTitle')}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center p-1 transition group-hover:scale-105"
            style={{
              backgroundColor: 'var(--song-accent)',
              color: 'var(--song-accent-on)',
            }}
          >
            <BeatDropLogo className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-lg italic tracking-normal bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              BeatDrop
            </span>
          </div>
        </Link>

        {/* Center: Desktop Navigation Tabs & Mega Menus (Exact Songspot Style) */}
        <nav className="songspot-site-desktop-nav" aria-label={t('mainNav')}>
          {/* 1. Play (Default Clip Mode) */}
          <Link
            href="/play"
            className="songspot-site-nav-link"
            aria-current={isPlayActive ? 'page' : undefined}
            data-section={isPlayActive ? 'active' : undefined}
            onClick={() => setActiveMenu(null)}
          >
            {t('play')}
          </Link>

          {/* 2. Music Categories (Unified Pill with Dropdown) */}
          <div className="songspot-site-quiz-menu">
            <button
              type="button"
              className="songspot-site-nav-link flex items-center gap-1.5"
              aria-expanded={activeMenu === 'clip'}
              aria-current={isCategoriesActive ? 'page' : undefined}
              data-section={isCategoriesActive || activeMenu === 'clip' ? 'active' : undefined}
              onClick={() => setActiveMenu(activeMenu === 'clip' ? null : 'clip')}
            >
              <span>{t('categories')}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 opacity-60 transition-transform duration-200 ${
                  activeMenu === 'clip' ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Music Quizzes Mega Panel */}
            <div
              className="songspot-site-quiz-panel"
              data-mode="clips"
              data-open={activeMenu === 'clip' ? 'true' : 'false'}
            >
              {/* Left Column: Interactive Mode Card */}
              <div className="songspot-menu-mode">
                <span className="songspot-menu-mode-badge">{t('clip.badge')}</span>
                <p className="songspot-menu-mode-title">{t('clip.title')}</p>
                <p className="songspot-menu-mode-description">
                  <span>{t('clip.line1')}</span>
                  <span>{t('clip.line2')}</span>
                </p>

                {/* Waveform & Stages Demo */}
                <div className="songspot-menu-demo" aria-hidden="true">
                  <div className="w-full h-10 rounded-lg bg-emerald-950/40 border border-emerald-800/40 p-2 flex items-center justify-between gap-1 overflow-hidden">
                    {[40, 65, 30, 85, 95, 45, 70, 50, 90, 60, 35, 75, 100, 80, 55, 68, 92, 40, 78, 60, 48, 88].map(
                      (h, i) => (
                        <div
                          key={i}
                          className="w-1 rounded-full transition-all"
                          style={{
                            height: `${h}%`,
                            backgroundColor:
                              i < 8
                                ? 'var(--song-accent)'
                                : 'color-mix(in srgb, var(--song-accent) 25%, transparent)',
                          }}
                        />
                      )
                    )}
                  </div>
                  <div className="songspot-menu-stages">
                    <span data-selected="true">0.5s</span>
                    <span data-selected="false">1.5s</span>
                    <span data-selected="false">3s</span>
                    <span data-selected="false">6s</span>
                    <span data-selected="false">10s</span>
                  </div>
                  <div className="songspot-menu-search-demo">
                    <Search className="w-4 h-4" />
                    <span>{t('clip.searchDemo')}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePlayClipChallenge}
                  className="songspot-menu-play"
                >
                  <span>{t('clip.cta')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Right Column: Quiz Directory */}
              <div className="songspot-site-quiz-directory">
                <div className="songspot-site-quiz-groups">
                  <div>
                    <p>{t('genres')}</p>
                    {topGenres.slice(0, 5).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleSelectGenreQuiz('genre', g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>

                  <div>
                    <p>{t('eras')}</p>
                    {topEras.slice(0, 5).map((e) => (
                      <button
                        key={e.value}
                        type="button"
                        onClick={() => handleSelectEraQuiz('year', e.value)}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <p>{t('artists')}</p>
                    {topArtists.slice(0, 5).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => handleSelectArtistQuiz('artist', a)}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <Link
                  href="/categories"
                  onClick={() => setActiveMenu(null)}
                  className="songspot-site-browse-all"
                >
                  <span>{t('browseAll')}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>

          {/* 3. Daily Challenge */}
          <Link
            href="/daily"
            className="songspot-site-nav-link"
            aria-current={isDailyActive ? 'page' : undefined}
            data-section={isDailyActive ? 'active' : undefined}
            onClick={() => setActiveMenu(null)}
          >
            Daily Challenge
          </Link>

          {/* 4. Song Guesser (Unified Pill with Dropdown) */}
          <div className="songspot-site-quiz-menu">
            <button
              type="button"
              className="songspot-site-nav-link flex items-center gap-1.5"
              aria-expanded={activeMenu === 'guesser'}
              aria-current={isGuesserActive ? 'page' : undefined}
              data-section={isGuesserActive || activeMenu === 'guesser' ? 'active' : undefined}
              onClick={() => setActiveMenu(activeMenu === 'guesser' ? null : 'guesser')}
            >
              <span>Song Guesser</span>
              <ChevronDown
                className={`w-3.5 h-3.5 opacity-60 transition-transform duration-200 ${
                  activeMenu === 'guesser' ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Song Guesser Mega Panel */}
            <div
              className="songspot-site-quiz-panel"
              data-mode="choice"
              data-open={activeMenu === 'guesser' ? 'true' : 'false'}
            >
              {/* Left Column: Mode Card */}
              <div className="songspot-menu-mode">
                <span className="songspot-menu-mode-badge">{t('choice.badge')}</span>
                <p className="songspot-menu-mode-title">{t('choice.title')}</p>
                <p className="songspot-menu-mode-description">
                  <span>{t('choice.line1')}</span>
                  <span>{t('choice.line2')}</span>
                </p>

                {/* Multiple Choice Demo Preview */}
                <div className="songspot-menu-demo" aria-hidden="true">
                  <div className="songspot-menu-answers">
                    <div data-selected="true">
                      <span>A</span>
                      <span>{t('choice.demoA')}</span>
                    </div>
                    <div data-selected="false">
                      <span>B</span>
                      <span>{t('choice.demoB')}</span>
                    </div>
                    <div data-selected="false">
                      <span>C</span>
                      <span>{t('choice.demoC')}</span>
                    </div>
                    <div data-selected="false">
                      <span>D</span>
                      <span>{t('choice.demoD')}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePlayMultipleChoice}
                  className="songspot-menu-play"
                >
                  <span>{t('choice.cta')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Right Column: Quiz Directory */}
              <div className="songspot-site-quiz-directory">
                <div className="songspot-site-quiz-groups">
                  <div>
                    <p>{t('genres')}</p>
                    {topGenres.slice(0, 5).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleSelectGenreQuiz('guesser', g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>

                  <div>
                    <p>{t('eras')}</p>
                    {topEras.slice(0, 5).map((e) => (
                      <button
                        key={e.value}
                        type="button"
                        onClick={() => handleSelectEraQuiz('guesser', e.value)}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <p>{t('artists')}</p>
                    {topArtists.slice(0, 5).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => handleSelectArtistQuiz('guesser', a)}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <Link
                  href="/guesser"
                  onClick={() => setActiveMenu(null)}
                  className="songspot-site-browse-all"
                >
                  <span>{t('browseAll')}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Right: Actions (Language/Locale, Stats, Leaderboard, Artists, Theme, Mobile Trigger) */}
        <div className="songspot-site-header-actions">
          {/* Songspot-style Language / Catalog Switcher Dropdown (in the drawer on phones) */}
          <div className="relative shrink-0 max-sm:hidden">
            <button
              type="button"
              className="songspot-header-locale"
              onClick={() =>
                setActiveMenu(activeMenu === 'locale' ? null : 'locale')
              }
              title={t('catalog.switchTitle')}
              aria-label={t('catalog.ariaLabel', { label: currentCategoryObj.label })}
              aria-expanded={activeMenu === 'locale'}
            >
              <Globe className="w-3.5 h-3.5" style={{ color: 'var(--song-accent-text)' }} />
              <span className="hidden xl:inline font-bold">{currentCategoryObj.label}</span>
              <span className="xl:hidden font-bold">{currentCategoryObj.badge}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {activeMenu === 'locale' && (
              <div
                className="absolute right-0 mt-2 w-52 rounded-2xl border p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              >
                <div
                  className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--song-muted)' }}
                >
                  {t('catalog.choose')}
                </div>
                {categories.map((cat) => {
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        onCategoryChange(cat.id);
                        setActiveMenu(null);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition hover:brightness-110"
                      style={
                        isSelected
                          ? {
                              backgroundColor: 'color-mix(in srgb, var(--song-accent) 18%, var(--song-surface))',
                              color: 'var(--song-accent-text)',
                            }
                          : {
                              color: 'var(--song-text)',
                            }
                      }
                    >
                      <span>{cat.label}</span>
                      {isSelected && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Unified Settings Dropdown: artists & theme (in the drawer on phones) */}
          <div className="relative shrink-0 max-sm:hidden">
            <button
              type="button"
              onClick={() =>
                setActiveMenu(activeMenu === 'settings' ? null : 'settings')
              }
              className="h-9 px-2.5 sm:px-3 rounded-full border flex items-center gap-1.5 text-xs font-bold transition hover:brightness-110"
              style={{
                backgroundColor:
                  activeMenu === 'settings'
                    ? 'var(--song-surface-soft)'
                    : 'color-mix(in srgb, var(--song-surface) 90%, transparent)',
                borderColor: 'var(--song-border)',
                color: 'var(--song-text)',
              }}
              title={t('settings.title')}
              aria-label={t('settings.ariaLabel')}
              aria-expanded={activeMenu === 'settings'}
            >
              <Settings className="w-3.5 h-3.5" style={{ color: 'var(--song-accent-text)' }} />
              <span className="hidden sm:inline">{t('settings.label')}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {activeMenu === 'settings' && (
              <div
                className="absolute right-0 mt-2 w-72 rounded-2xl border p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              >
                {/* 1. Artists */}
                <div
                  className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider"
                  style={{ color: 'var(--song-muted)' }}
                >
                  {t('artistLibrary')}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenAddArtist();
                  }}
                  className="w-full px-3 py-2 rounded-xl text-left flex items-center justify-between transition hover:brightness-110 mb-1"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    color: 'var(--song-text)',
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--song-accent) 20%, transparent)',
                        color: 'var(--song-accent-text)',
                      }}
                    >
                      <PlusCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">{t('manageArtists')}</div>
                      <div className="text-[10px]" style={{ color: 'var(--song-muted)' }}>
                        {t('manageArtistsHint')}
                      </div>
                    </div>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                    style={{
                      backgroundColor: 'var(--song-surface)',
                      color: 'var(--song-accent-text)',
                      border: '1px solid var(--song-border)',
                    }}
                  >
                    {artistCount}
                  </span>
                </button>

                {/* 2. Theme */}
                <div
                  className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider border-t mt-2 pt-2 flex items-center justify-between"
                  style={{ borderColor: 'var(--song-border)', color: 'var(--song-muted)' }}
                >
                  <span>{t('theme')}</span>
                  <Palette className="w-3.5 h-3.5" />
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
                          setActiveMenu(null);
                        }}
                        className="w-full px-3 py-1.5 rounded-xl text-left flex items-center gap-2.5 transition hover:brightness-110"
                        style={{
                          backgroundColor: selected ? 'var(--song-surface-soft)' : 'transparent',
                        }}
                      >
                        <span
                          className="w-4 h-4 rounded-full flex-shrink-0 border border-white/20 shadow-sm"
                          style={{ backgroundColor: preset.accent }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate">{preset.name}</div>
                          <div
                            className="text-[10px] truncate"
                            style={{ color: 'var(--song-muted)' }}
                          >
                            {t(`themes.${id}.description`)}
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
                    <span>{t('syncAccent')}</span>
                    <input
                      type="checkbox"
                      checked={syncDifficultyAccent}
                      onChange={(e) => setSyncDifficultyAccent(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                  </label>
                )}

                {/* 3. Language */}
                <div
                  className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider border-t mt-2 pt-2 flex items-center justify-between"
                  style={{ borderColor: 'var(--song-border)', color: 'var(--song-muted)' }}
                >
                  <span>{t('language')}</span>
                  <Globe className="w-3.5 h-3.5" />
                </div>
                <div className="space-y-1" role="group" aria-label={t('languageGroup')}>
                  {renderLanguageOptions(
                    'w-full px-3 py-1.5 rounded-xl text-left text-xs font-bold flex items-center justify-between transition hover:brightness-110'
                  )}
                </div>

                {/* 4. Admin Console */}
                <div className="border-t mt-2 pt-2" style={{ borderColor: 'var(--song-border)' }}>
                  <Link
                    href="/admin"
                    onClick={() => setActiveMenu(null)}
                    className="w-full px-3 py-2 rounded-xl text-left flex items-center justify-between text-xs font-bold transition hover:brightness-110"
                    style={{
                      backgroundColor: 'var(--song-surface-soft)',
                      color: 'var(--song-text)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Admin Console</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold">{t('adminKeyRequired')}</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Hamburger Toggle Button */}
          <button
            type="button"
            className="songspot-site-mobile-trigger"
            onClick={() =>
              setActiveMenu(activeMenu === 'mobile' ? null : 'mobile')
            }
            aria-label={activeMenu === 'mobile' ? t('menu.close') : t('menu.open')}
            aria-expanded={activeMenu === 'mobile'}
          >
            {activeMenu === 'mobile' ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Backdrop & Full-Height Drawer (Portalled to document.body to escape header backdrop-filter) */}
      <Modal
        open={mounted && activeMenu === 'mobile'}
        onClose={() => setActiveMenu(null)}
        title={t('menu.title')}
        placement="right"
        className="max-[1140px]:flex min-[1141px]:hidden"
        panelClassName="!p-4 sm:!p-5 !pt-[calc(1rem+env(safe-area-inset-top,0px))] !pb-[calc(1rem+env(safe-area-inset-bottom,0px))] !overflow-y-auto !border-l !rounded-l-3xl"
      >
            <div
              ref={mobileDrawerRef}
              className="h-full flex flex-col gap-4 animate-in slide-in-from-right duration-250 ease-out"
              style={{ color: 'var(--song-text)' }}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[var(--song-border)]">
                <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
                  {t('mainNav')}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveMenu(null)}
                  className="p-1.5 rounded-xl border hover:bg-white/10 transition"
                  style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
                  aria-label={t('menu.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Primary Links */}
              <div className="space-y-1.5">
                <Link
                  href="/play"
                  onClick={() => setActiveMenu(null)}
                  className="w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold flex items-center justify-between transition hover:brightness-110"
                  style={
                    isPlayActive
                      ? {
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                        }
                      : {
                          backgroundColor: 'var(--song-surface-soft)',
                          color: 'var(--song-text)',
                        }
                  }
                >
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    <span>{t('mobile.play')}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 opacity-70" />
                </Link>

                <Link
                  href="/daily"
                  onClick={() => setActiveMenu(null)}
                  className="w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold flex items-center justify-between transition hover:brightness-110"
                  style={
                    isDailyActive
                      ? {
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                        }
                      : {
                          backgroundColor: 'var(--song-surface-soft)',
                          color: 'var(--song-text)',
                        }
                  }
                >
                  <span className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    <span>{t('mobile.daily')}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 opacity-70" />
                </Link>

                <Link
                  href="/guesser"
                  onClick={() => setActiveMenu(null)}
                  className="w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold flex items-center justify-between transition hover:brightness-110"
                  style={
                    isGuesserActive
                      ? {
                          backgroundColor: '#b57aff',
                          color: '#07110c',
                        }
                      : {
                          backgroundColor: 'var(--song-surface-soft)',
                          color: 'var(--song-text)',
                        }
                  }
                >
                  <span className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4" />
                    <span>{t('mobile.guesser')}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 opacity-70" />
                </Link>

                <Link
                  href="/categories"
                  onClick={() => setActiveMenu(null)}
                  className="w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold flex items-center justify-between transition hover:brightness-110"
                  style={
                    isCategoriesActive
                      ? {
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                        }
                      : {
                          backgroundColor: 'var(--song-surface-soft)',
                          color: 'var(--song-text)',
                        }
                  }
                >
                  <span className="flex items-center gap-2">
                    <Compass className="w-4 h-4" />
                    <span>{t('categories')}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 opacity-70" />
                </Link>
              </div>

              {/* Accordion Topics for Clip Quizzes */}
              <details className="border-t border-[var(--song-border)] pt-2 group">
                <summary className="flex items-center justify-between py-2 text-xs font-bold cursor-pointer select-none">
                  <span>{t('mobile.topics')}</span>
                  <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="py-2 space-y-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--song-muted)' }}>
                      {t('genres')}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {topGenres.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => handleSelectGenreQuiz('genre', g)}
                          className="px-2 py-1 rounded-lg border text-xs font-medium"
                          style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--song-muted)' }}>
                      {t('eras')}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {topEras.map((e) => (
                        <button
                          key={e.value}
                          type="button"
                          onClick={() => handleSelectEraQuiz('year', e.value)}
                          className="px-2 py-1 rounded-lg border text-xs font-medium"
                          style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--song-muted)' }}>
                      {t('artists')}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {topArtists.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => handleSelectArtistQuiz('artist', a)}
                          className="px-2 py-1 rounded-lg border text-xs font-medium"
                          style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </details>

              {/* Catalog switcher (header dropdown is hidden on phones) */}
              <div className="border-t border-[var(--song-border)] pt-3">
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--song-muted)' }}>
                  {t('catalog.section')}
                </div>
                <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t('catalog.choose')}>
                  {categories.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onCategoryChange(cat.id)}
                        className="min-h-[44px] px-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center leading-tight transition hover:brightness-110"
                        style={
                          isSelected
                            ? {
                                backgroundColor: 'color-mix(in srgb, var(--song-accent) 18%, var(--song-surface))',
                                borderColor: 'var(--song-accent)',
                                color: 'var(--song-accent-text)',
                              }
                            : {
                                backgroundColor: 'var(--song-surface-soft)',
                                borderColor: 'var(--song-border)',
                                color: 'var(--song-text)',
                              }
                        }
                      >
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Language switcher */}
              <div className="border-t border-[var(--song-border)] pt-3">
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--song-muted)' }}>
                  {t('language')}
                </div>
                <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t('languageGroup')}>
                  {renderLanguageOptions(
                    'min-h-[44px] px-3 rounded-xl border border-[var(--song-border)] text-xs font-bold flex items-center justify-center gap-1.5 transition hover:brightness-110'
                  )}
                </div>
              </div>

              {/* Theme picker (header settings dropdown is hidden on phones) */}
              <details className="border-t border-[var(--song-border)] pt-2 group sm:hidden">
                <summary className="flex items-center justify-between min-h-[44px] text-xs font-bold cursor-pointer select-none">
                  <span className="flex items-center gap-2">
                    <Palette className="w-4 h-4" style={{ color: 'var(--song-accent-text)' }} />
                    <span>{t('theme')}</span>
                  </span>
                  <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="pb-2 space-y-1">
                  {(Object.keys(THEME_PRESETS) as ThemeId[]).map((id) => {
                    const preset = THEME_PRESETS[id];
                    const selected = themeId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setThemeId(id)}
                        className="w-full min-h-[44px] px-3 rounded-xl text-left flex items-center gap-2.5 transition hover:brightness-110"
                        style={{ backgroundColor: selected ? 'var(--song-surface-soft)' : 'transparent' }}
                      >
                        <span
                          className="w-4 h-4 rounded-full flex-shrink-0 border border-white/20"
                          style={{ backgroundColor: preset.accent }}
                        />
                        <span className="flex-1 min-w-0 text-xs font-bold truncate">{preset.name}</span>
                        {selected && <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--song-accent-text)' }} />}
                      </button>
                    );
                  })}
                  {themeId === 'songspot-dark' && (
                    <label
                      className="min-h-[44px] px-3 flex items-center justify-between text-[11px] cursor-pointer"
                      style={{ color: 'var(--song-muted)' }}
                    >
                      <span>{t('syncAccent')}</span>
                      <input
                        type="checkbox"
                        checked={syncDifficultyAccent}
                        onChange={(e) => setSyncDifficultyAccent(e.target.checked)}
                        className="rounded accent-emerald-500"
                      />
                    </label>
                  )}
                </div>
              </details>

              {/* Mobile Quick Action Buttons (Rankings & Artists) */}
              <div className="space-y-1.5 border-t border-[var(--song-border)] pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenLeaderboard();
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between border transition hover:brightness-110"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                    color: 'var(--song-text)',
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>{t('leaderboard')}</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMenu(null);
                    onOpenAddArtist();
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between border transition hover:brightness-110"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                    color: 'var(--song-text)',
                  }}
                >
                  <span className="flex items-center gap-2">
                    <PlusCircle className="w-4 h-4" style={{ color: 'var(--song-accent-text)' }} />
                    <span>{t('manageLibrary')}</span>
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                    style={{
                      backgroundColor: 'var(--song-surface)',
                      color: 'var(--song-accent-text)',
                    }}
                  >
                    {t('artistCount', { count: artistCount })}
                  </span>
                </button>

                <Link
                  href="/admin"
                  onClick={() => setActiveMenu(null)}
                  className="w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between border transition hover:brightness-110"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                    color: 'var(--song-text)',
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span>Admin Console</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold">{t('adminKeyRequired')}</span>
                </Link>
              </div>

              {/* Stats Pill in Mobile */}
              <div
                className="p-3 rounded-xl border flex items-center justify-between text-xs font-bold mt-auto"
                style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
              >
                <span className="flex items-center gap-1 text-orange-400">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Streak: {streak}</span>
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Best: {bestStreak}</span>
                </span>
                {fastestTime !== null && (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Zap className="w-3.5 h-3.5" />
                    <span>{fastestTime}s</span>
                  </span>
                )}
              </div>
          </div>
      </Modal>
    </header>
  );
};
