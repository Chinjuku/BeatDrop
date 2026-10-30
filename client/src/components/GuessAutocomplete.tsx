import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, SkipForward, Check, Flag } from 'lucide-react';
import { CategoryType, GameMode, Song } from '../../../shared/types';

interface GuessAutocompleteProps {
  category: CategoryType;
  mode: GameMode;
  artistFilter?: string;
  onSelectGuess: (song: Song) => void;
  onSkip: () => void;
  onGiveUp?: () => void;
  nextStageSeconds: number | null;
  disabled?: boolean;
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
}) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isArtistScoped = mode === 'artist' && Boolean(artistFilter);

  useEffect(() => {
    // In standard mode, require at least 1 character; in Artist Mode, allow empty query to list artist's songs
    if (!isArtistScoped && query.trim().length < 1) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

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
        const res = await fetch(`/api/autocomplete?${params.toString()}`);
        const json = await res.json();
        if (json.code === 0) {
          const list: Song[] = json.data || [];
          setSuggestions(list);
          setActiveIndex(list.length > 0 ? 0 : -1);
          if (query.trim().length > 0 || (isArtistScoped && document.activeElement === inputRef.current)) {
            setIsOpen(true);
          }
        }
      } catch (err) {
        console.error('Autocomplete error:', err);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
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
    onSelectGuess(song);
    setQuery('');
    setIsOpen(false);
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
      {/* Suggestions Dropdown (Positioned above or below smoothly) */}
      {isOpen && suggestions.length > 0 && (
        <div
          id="songspot-suggestions"
          className="absolute bottom-full mb-2 left-0 right-0 rounded-2xl border p-1.5 shadow-2xl max-h-60 overflow-y-auto z-50"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
          }}
          role="listbox"
        >
          {isArtistScoped && (
            <div
              className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider border-b mb-1 flex items-center justify-between"
              style={{ borderColor: 'var(--song-border)', color: 'var(--song-accent-text)' }}
            >
              <span>🎤 เพลงเฉพาะของ {artistFilter}</span>
              <span>↑↓ เลือก • Enter ตอบ</span>
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
                    ทายเพลงนี้
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Search Bar & Skip Button Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div
          className="flex-1 flex items-center px-3.5 py-2.5 rounded-xl border transition focus-within:ring-2"
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
            disabled={disabled}
            onFocus={() => {
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
              isArtistScoped
                ? `พิมพ์หรือคลิกเลือกเพลงของ ${artistFilter}...`
                : 'พิมพ์ชื่อเพลง หรือ ศิลปิน เพื่อทายคำตอบ (↑↓ เลือก, Enter ส่ง)...'
            }
            className="w-full bg-transparent border-0 outline-none text-xs sm:text-sm font-semibold placeholder:opacity-60"
            style={{ color: 'var(--song-text)' }}
          />
          {loading && (
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
            disabled={disabled}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 transition hover:brightness-110 flex-shrink-0"
            style={{
              backgroundColor: 'var(--song-surface-soft)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            <SkipForward className="w-4 h-4" style={{ color: 'var(--song-accent-text)' }} />
            <span>
              {nextStageSeconds !== null
                ? `ข้าม (+ปลดล็อก ${nextStageSeconds}s)`
                : 'ยอมแพ้ / ดูเฉลย'}
            </span>
          </button>

          {/* Dedicated Give Up Button */}
          {onGiveUp && (
            <button
              type="button"
              onClick={onGiveUp}
              disabled={disabled}
              className="px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition hover:brightness-110 flex-shrink-0"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 0.35)',
                color: '#f87171',
              }}
              title="ยอมแพ้เพื่อเฉลยเพลงทันที"
            >
              <Flag className="w-3.5 h-3.5 text-red-400" />
              <span>ยอมแพ้</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

