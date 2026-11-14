'use client';
import { useTranslations } from 'next-intl';
import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Loader2, Search, SkipForward, Check, Flag, ChevronLeft, X, Mic2 } from 'lucide-react';
import { CategoryType, GameMode, Song } from '../types';
import { Modal } from './Modal';

interface GuessAutocompleteProps {
  category: CategoryType;
  mode: GameMode;
  artistFilter?: string;
  onSelectGuess: (song: Song) => void;
  onSkip: () => void;
  onGiveUp?: () => void;
  nextStageSeconds: number | null;
  disabled?: boolean;
  submitting?: boolean;
}

export const GuessAutocomplete: React.FC<GuessAutocompleteProps> = ({
  category,
  mode,
  artistFilter,
  onSelectGuess,
  onSkip,
  onGiveUp,
  nextStageSeconds,
  disabled,
  submitting,
}) => {
  const t = useTranslations('Guess');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [networkError, setNetworkError] = useState<string | null>(null);
  // Songspot-style fullscreen search sheet on phones
  const [mobileOpen, setMobileOpen] = useState(false);
  // Giving up ends the round (and the streak), so it takes a second tap within 3s.
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  useEffect(() => {
    if (!confirmGiveUp) return;
    const timer = window.setTimeout(() => setConfirmGiveUp(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmGiveUp]);
  useEffect(() => {
    if (disabled || submitting) setConfirmGiveUp(false);
  }, [disabled, submitting]);
  const handleGiveUpClick = () => {
    if (!confirmGiveUp) {
      setConfirmGiveUp(true);
      return;
    }
    setConfirmGiveUp(false);
    onGiveUp?.();
  };

  // iOS: the on-screen keyboard shrinks the *visual* viewport but not the layout one, so a
  // 100dvh sheet ends up partly behind the keyboard and the page scrolls underneath it.
  // Track the visual viewport and size the sheet to exactly what is visible.
  useEffect(() => {
    if (!mobileOpen) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    const sync = () => {
      const height = vv ? vv.height : window.innerHeight;
      const top = vv ? vv.offsetTop : 0;
      root.style.setProperty('--search-sheet-h', `${Math.round(height)}px`);
      root.style.setProperty('--search-sheet-top', `${Math.round(top)}px`);
    };
    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      root.style.removeProperty('--search-sheet-h');
      root.style.removeProperty('--search-sheet-top');
    };
  }, [mobileOpen]);

  // Auto-close mobile sheet if rotated/resized to desktop width
  useEffect(() => {
    if (!mobileOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 640) setMobileOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [mobileOpen]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  // Open the mobile search sheet and focus its field in the same tap. iOS only raises the
  // keyboard when focus() runs synchronously inside the user gesture, so render the sheet
  // with flushSync and focus right away instead of waiting for an effect or autoFocus.
  const openMobileSearch = () => {
    flushSync(() => setMobileOpen(true));
    const field = sheetInputRef.current;
    if (field) {
      field.focus({ preventScroll: true });
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }
  };

  const isArtistScoped = Boolean(artistFilter && artistFilter !== 'any');

  useEffect(() => {
    // In standard mode, require at least 1 character; in Artist Mode, allow empty query to list artist's songs
    if (!isArtistScoped && query.trim().length < 1) {
      setSuggestions([]);
      setNetworkError(null);
      setIsOpen(false);
      return;
    }

    setNetworkError(null);
    const abortController = new AbortController();
    // 10-second timeout to handle high latency / stalled 2G/Edge connections
    const timeoutId = setTimeout(() => {
      abortController.abort('timeout');
    }, 10000);

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          category,
          limit: isArtistScoped ? '50' : '10',
        });
        if (isArtistScoped && artistFilter) {
          params.set('artist', artistFilter);
        }
        const res = await fetch(`/api/autocomplete?${params.toString()}`, {
          signal: abortController.signal,
        });
        const json = await res.json();
        if (json.code === 0) {
          const list: Song[] = json.data || [];
          setSuggestions(list);
          setActiveIndex(list.length > 0 ? 0 : -1);
          if (query.trim().length > 0 || (isArtistScoped && document.activeElement === inputRef.current)) {
            setIsOpen(true);
          }
        }
      } catch (err: unknown) {
        if (abortController.signal.aborted && abortController.signal.reason !== 'timeout') {
          return;
        }
        if (abortController.signal.reason === 'timeout') {
          setNetworkError(t('errors.timeout'));
        } else {
          setNetworkError(t('errors.network'));
          console.error('Autocomplete error:', err);
        }
      } finally {
        clearTimeout(timeoutId);
        if (!abortController.signal.aborted || abortController.signal.reason === 'timeout') {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [query, category, isArtistScoped, artistFilter]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const submitSong = (song: Song) => {
    if (disabled || submitting) return;
    onSelectGuess(song);
    setQuery('');
    setIsOpen(false);
    setMobileOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && suggestions.length > 0) {
        setIsOpen(true);
        return;
      }
      setActiveIndex((prev) =>
        suggestions.length > 0 ? (prev + 1) % suggestions.length : -1
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        suggestions.length > 0
          ? (prev - 1 + suggestions.length) % suggestions.length
          : -1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && activeIndex >= 0 && suggestions[activeIndex]) {
        submitSong(suggestions[activeIndex]);
      } else if (suggestions.length > 0) {
        submitSong(suggestions[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="w-full relative mt-5">
      {/* Mobile fullscreen search sheet (Songspot style) */}
      <Modal
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        title={t('searchTitle')}
        placement="fullscreen"
        dismissOnBackdrop={false}
        className="search-sheet-root !z-[200] !items-start !bg-[var(--song-page)] !backdrop-blur-none overscroll-none"
        panelClassName="search-sheet-panel !mt-[var(--search-sheet-top,0px)] !h-[var(--search-sheet-h,100dvh)] !max-h-[var(--search-sheet-h,100dvh)] !flex-col !gap-2 !px-3 !pb-3 !pt-[calc(0.75rem+env(safe-area-inset-top,0px))] !overflow-hidden"
      >
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-2 shrink-0"
                aria-label={t('closeSearch')}
                style={{ color: 'var(--song-text)' }}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <div
                className="flex-1 flex items-center px-3 min-h-[46px] rounded-2xl border-2"
                style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-accent)' }}
              >
                <Search className="w-4 h-4 mr-2 shrink-0" style={{ color: 'var(--song-muted)' }} />
                <input
                  ref={sheetInputRef}
                  data-autofocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isArtistScoped ? t('mobilePlaceholderArtist', { artist: artistFilter ?? '' }) : t('mobilePlaceholder')}
                  className="w-full bg-transparent outline-none focus-visible:outline-none text-base font-semibold"
                  style={{ color: 'var(--song-text)', outline: 'none' }}
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setSuggestions([]);
                    }}
                    className="p-1 rounded-full hover:bg-white/10 shrink-0 cursor-pointer"
                    aria-label={t('clearSearch')}
                  >
                    <X className="w-4 h-4 opacity-60 hover:opacity-100" />
                  </button>
                ) : null}
                {loading && <Loader2 className="w-4 h-4 animate-spin ml-2 shrink-0" style={{ color: 'var(--song-accent-text)' }} />}
              </div>
              <button
                type="button"
                disabled={submitting || !suggestions[Math.max(0, activeIndex)]}
                onClick={() => {
                  const s = suggestions[Math.max(0, activeIndex)];
                  if (s) submitSong(s);
                }}
                className="px-5 min-h-[46px] rounded-2xl font-extrabold text-sm shrink-0 disabled:opacity-50"
                style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('submit')}
              </button>
            </div>

            {suggestions.length > 0 && (
              <div
                className="min-h-0 flex-1 rounded-2xl border p-1.5 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  WebkitOverflowScrolling: 'touch',
                }}
                role="listbox"
              >
                {suggestions.map((song, idx) => (
                  <button
                    key={song.id}
                    type="button"
                    role="option"
                    aria-selected={idx === activeIndex}
                    onClick={() => (idx === activeIndex ? submitSong(song) : setActiveIndex(idx))}
                    className="w-full px-2.5 py-2 rounded-xl text-left flex items-center gap-3"
                    style={{
                      color: 'var(--song-text)',
                      backgroundColor: idx === activeIndex ? 'rgba(var(--song-accent-rgb), 0.16)' : undefined,
                    }}
                  >
                    <img src={song.artworkUrl} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold truncate">{song.title}</div>
                      <div className="text-sm truncate" style={{ color: 'var(--song-muted)' }}>
                        {song.artistName}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {networkError && !loading && (
              <div
                className="rounded-2xl border p-4 text-center text-xs sm:text-sm font-semibold text-rose-400"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.35)' }}
              >
                {networkError}
              </div>
            )}

            {!networkError && query.trim().length > 0 && !loading && suggestions.length === 0 && (
              <div
                className="rounded-2xl border p-4 text-center text-xs sm:text-sm font-semibold"
                style={{ backgroundColor: 'var(--song-surface)', borderColor: 'var(--song-border)', color: 'var(--song-muted)' }}
              >
                {t('noResults', { query })}
              </div>
            )}
          </div>
      </Modal>
      {/* Suggestions Dropdown (Positioned above or below smoothly) */}
      {isOpen && (suggestions.length > 0 || networkError || (query.trim().length > 0 && !loading)) && (
        <div
          id="songspot-suggestions"
          className="absolute bottom-full mb-2 left-0 right-0 rounded-2xl border p-1.5 shadow-2xl max-h-48 sm:max-h-60 overflow-y-auto z-50"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
          }}
          role="listbox"
        >
          {networkError ? (
            <div className="py-3 px-4 text-center text-xs font-semibold text-rose-400">
              {networkError}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-3 px-4 text-center text-xs font-semibold" style={{ color: 'var(--song-muted)' }}>
              {t('noResults', { query })}
            </div>
          ) : (
            <>
              {isArtistScoped && (
                <div
                  className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider border-b mb-1 flex items-center justify-between"
                  style={{ borderColor: 'var(--song-border)', color: 'var(--song-accent-text)' }}
                >
                  <Mic2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{t('artistOnly', { artist: artistFilter ?? '' })}</span>
                  <span>{t('keyboardHint')}</span>
                </div>
              )}

              {suggestions.map((song, idx) => {
                const isSelected = idx === activeIndex;
                return (
                  <button
                    key={song.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => submitSong(song)}
                    className="w-full px-3 py-2 rounded-xl text-left flex items-center gap-3 transition"
                    style={
                      isSelected
                        ? {
                            backgroundColor: 'rgba(var(--song-accent-rgb), 0.16)',
                            color: 'var(--song-text)',
                          }
                        : {
                            color: 'var(--song-text)',
                          }
                    }
                  >
                    <img
                      src={song.artworkUrl}
                      alt={song.title}
                      className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-white/10"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-bold truncate">{song.title}</div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--song-muted)' }}>
                        {song.artistName} • {song.releaseYear}
                      </div>
                    </div>
                    {isSelected && (
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-extrabold flex items-center gap-1 flex-shrink-0"
                        style={{
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                        }}
                      >
                        <Check className="w-3 h-3" />
                        {t('guessThis')}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Search Bar & Skip Button Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div
          className="flex-1 flex items-center px-3.5 py-2.5 min-h-[42px] rounded-xl border transition focus-within:ring-2"
          style={{
            backgroundColor: 'var(--song-surface-soft)',
            borderColor: isOpen ? 'var(--song-accent)' : 'var(--song-border)',
          }}
        >
          <Search className="w-4 h-4 mr-2.5 flex-shrink-0" style={{ color: 'var(--song-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={disabled || submitting}
            onFocus={(e) => {
              if (window.innerWidth < 640) {
                e.currentTarget.blur();
                openMobileSearch();
                return;
              }
              if (isArtistScoped || suggestions.length > 0) {
                setIsOpen(true);
              }
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              submitting
                ? t('checkingAnswer')
                : isArtistScoped
                  ? t('placeholderArtist', { artist: artistFilter ?? '' })
                  : t('placeholder')
            }
            className="w-full bg-transparent border-0 outline-none text-base sm:text-sm font-semibold placeholder:opacity-60 disabled:opacity-50"
            style={{ color: 'var(--song-text)' }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
              }}
              className="p-1 rounded-full hover:bg-white/10 shrink-0 cursor-pointer mr-1"
              aria-label={t('clearSearch')}
            >
              <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
            </button>
          ) : null}
          {(loading || submitting) && (
            <Loader2
              className="w-4 h-4 animate-spin ml-2 flex-shrink-0"
              style={{ color: 'var(--song-accent-text)' }}
            />
          )}
        </div>

        {/* Action Buttons: Skip & Give Up */}
        <div className="flex items-center gap-2">
          {/* Skip / Unlock More Time Button */}
          <button
            type="button"
            onClick={onSkip}
            disabled={disabled || submitting}
            className="flex-1 sm:flex-none px-3.5 sm:px-4 py-2.5 min-h-[44px] rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition hover:brightness-110 flex-shrink-0 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            style={{
              backgroundColor: 'var(--song-surface-soft)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <SkipForward className="w-4 h-4" style={{ color: 'var(--song-accent-text)' }} />
            )}
            <span>
              {submitting
                ? t('checking')
                : nextStageSeconds !== null
                  ? t('skip', { seconds: nextStageSeconds })
                  : t('giveUpReveal')}
            </span>
          </button>

          {/* Dedicated Give Up Button */}
          {onGiveUp && (
            <button
              type="button"
              onClick={handleGiveUpClick}
              disabled={disabled || submitting}
              className="px-3 sm:px-3.5 py-2.5 min-h-[44px] rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition hover:brightness-110 flex-shrink-0 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              style={
                confirmGiveUp
                  ? { backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#ffffff' }
                  : {
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                      color: '#f87171',
                    }
              }
              title={t('giveUpTitle')}
            >
              <Flag className={`w-3.5 h-3.5 ${confirmGiveUp ? 'text-white' : 'text-red-400'}`} aria-hidden="true" />
              <span aria-live="polite">{confirmGiveUp ? t('confirmGiveUp') : t('giveUp')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

