'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Loader2,
  Mic2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { Artist } from '../types';
import { useGame } from '../context/GameContext';

interface AddArtistModalProps {
  isOpen: boolean;
  onClose: () => void;
  artists: Artist[];
  onArtistAdded: (artist: Artist) => void;
  onArtistRemoved: (id: string) => void;
  onPlayArtist: (artist: Artist) => void;
}

interface ToastState {
  type: 'success' | 'error';
  title: string;
  detail?: string;
}

export const AddArtistModal: React.FC<AddArtistModalProps> = ({
  isOpen,
  onClose,
  artists,
  onArtistAdded,
  onArtistRemoved,
  onPlayArtist,
}) => {
  const { syncArtist, syncingArtistId, fetchArtists } = useGame();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [discovered, setDiscovered] = useState<Artist[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingName, setAddingName] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Refresh library artists from database immediately when opening modal
  useEffect(() => {
    if (isOpen) {
      fetchArtists();
    }
  }, [isOpen, fetchArtists]);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Fuzzy match helper (handles exact, substring, case, and vowel typos like weeknd / weekend)
  const matchesArtistFuzzy = (name: string, query: string): boolean => {
    const cleanName = (name || '').toLowerCase().trim();
    const cleanQuery = (query || '').toLowerCase().trim();
    if (!cleanQuery) return true;
    if (cleanName.includes(cleanQuery) || cleanQuery.includes(cleanName)) return true;
    // Strip vowels and symbols for fuzzy match
    const nameNoVowels = cleanName.replace(/[^a-z0-9\u0E00-\u0E7F]/g, '').replace(/[aeiou]/g, '');
    const queryNoVowels = cleanQuery.replace(/[^a-z0-9\u0E00-\u0E7F]/g, '').replace(/[aeiou]/g, '');
    if (nameNoVowels.length >= 3 && queryNoVowels.length >= 3) {
      if (nameNoVowels.includes(queryNoVowels) || queryNoVowels.includes(nameNoVowels)) {
        return true;
      }
    }
    return false;
  };

  // Debounce search query input (250ms for responsive typing)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Debounced search via iTunes Discovery API
  useEffect(() => {
    if (!isOpen || debouncedQuery.length < 2) {
      setDiscovered([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    let isMounted = true;
    const abortCtrl = new AbortController();
    const timeoutId = setTimeout(() => abortCtrl.abort(), 5000);
    setSearching(true);
    setSearchError(null);

    fetch(`/api/artists?q=${encodeURIComponent(debouncedQuery)}&discover=true`, {
      signal: abortCtrl.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`ค้นหาไม่สำเร็จ (HTTP ${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (!isMounted) return;
        if (json.code === 0 && Array.isArray(json.data)) {
          setDiscovered(json.data);
        } else {
          setDiscovered([]);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted || (err as Error)?.name === 'AbortError') return;
        console.error('Artist discovery error:', err);
        setSearchError((err as Error).message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
        setDiscovered([]);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (isMounted && !abortCtrl.signal.aborted) setSearching(false);
      });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      abortCtrl.abort();
    };
  }, [debouncedQuery, isOpen]);

  // Filtered Library Artists by search query
  const filteredLibrary = React.useMemo(() => {
    if (!searchQuery.trim()) return artists;
    return artists.filter((a) => matchesArtistFuzzy(a.name, searchQuery));
  }, [artists, searchQuery]);

  // Filtered Discovered Artists (exclude those already in library to prevent duplication)
  const uniqueDiscovered = React.useMemo(() => {
    const existingNames = new Set(artists.map((a) => a.name.toLowerCase()));
    return discovered.filter((d) => !existingNames.has(d.name.toLowerCase()));
  }, [discovered, artists]);

  const hasSearched = debouncedQuery.length >= 2;
  const isNotFound =
    hasSearched &&
    !searching &&
    !searchError &&
    filteredLibrary.length === 0 &&
    uniqueDiscovered.length === 0;

  const extractSoloArtistName = (name: string): string => {
    const tokens = (name || '')
      .split(/[,&/]|\b(?:feat\.?|ft\.?|featuring|with|x|and|ร่วมกับ)\b/i)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
    return tokens.length > 0 ? tokens[0] : (name || '').trim();
  };

  if (!isOpen) return null;

  const handleAddOrSync = async (
    name: string,
    category: 'thai' | 'international' = 'thai',
    mainGenre = 'Pop',
    avatarUrl = ''
  ) => {
    const cleanName = extractSoloArtistName(name);
    if (!cleanName) return;
    setAddingName(cleanName);
    setToast(null);
    try {
      const result = await syncArtist({
        name: cleanName,
        category,
        mainGenre,
        avatarUrl,
      });
      onArtistAdded(result.artist);
      setToast({
        type: 'success',
        title: `ซิงก์เพลงของ "${result.artist.name}" สำเร็จ!`,
        detail:
          result.added > 0
            ? `เพิ่มเพลงใหม่ +${result.added} เพลง (รวมในคลัง ${result.newCount} เพลง)`
            : `มีเพลงในคลังครบถ้วนแล้ว (${result.newCount} เพลง)`,
      });
      setSearchQuery('');
      setDiscovered([]);
    } catch (err) {
      setToast({
        type: 'error',
        title: `ไม่สามารถดึงเพลงของ "${cleanName}" ได้`,
        detail: (err as Error).message,
      });
    } finally {
      setAddingName(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto overflow-x-hidden animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Add and Manage Artists"
    >
      <div
        className="w-[calc(100vw-16px)] sm:w-full max-w-2xl md:max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] my-auto relative animate-in zoom-in-95 duration-200"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
          color: 'var(--song-text)',
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 sm:px-5 sm:py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--song-border)' }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <Mic2 className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--song-accent-text)' }} />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold truncate">
                เพิ่มและจัดการศิลปิน (Add / Manage Artists)
              </h2>
              <p className="text-[10px] sm:text-xs truncate" style={{ color: 'var(--song-muted)' }}>
                ค้นหาชื่อศิลปินเพื่อดึงเพลงเข้าคลังอัตโนมัติ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 transition flex-shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4">
          {/* Active Syncing Loading Indicator */}
          {syncingArtistId && (
            <div
              className="p-3 rounded-xl border text-xs font-bold flex items-center gap-2.5 animate-pulse"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--song-accent) 12%, var(--song-surface-soft))',
                borderColor: 'var(--song-accent)',
                color: 'var(--song-accent-text)',
              }}
            >
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span>กำลังดึงเพลงจาก iTunes API และบันทึกลงฐานข้อมูล...</span>
            </div>
          )}

          {/* Toast Feedback Notification */}
          {toast && (
            <div
              className="p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 shadow-lg"
              style={
                toast.type === 'success'
                  ? {
                      backgroundColor: 'color-mix(in srgb, var(--song-accent) 16%, var(--song-surface))',
                      borderColor: 'var(--song-accent)',
                      color: 'var(--song-accent-text)',
                    }
                  : {
                      backgroundColor: 'rgba(239, 68, 68, 0.14)',
                      borderColor: 'rgba(239, 68, 68, 0.45)',
                      color: '#fca5a5',
                    }
              }
              role="status"
            >
              <div className="flex items-start gap-2.5">
                {toast.type === 'success' ? (
                  <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-extrabold">{toast.title}</div>
                  {toast.detail && (
                    <div className="text-[11px] opacity-90 mt-0.5 font-semibold">{toast.detail}</div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="p-1 rounded-lg hover:bg-white/10 transition flex-shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Single Unified Search Box */}
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
                    e.preventDefault();
                    handleAddOrSync(searchQuery.trim());
                  }
                }}
                placeholder="ค้นหาชื่อศิลปิน เช่น NONT TANONT, Bodyslam, Three Man Down, Taylor Swift..."
                className="w-full pl-10 pr-10 py-3 rounded-xl border text-base sm:text-sm font-semibold focus:outline-none transition shadow-inner"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: searchQuery.trim().length >= 2 ? 'var(--song-accent)' : 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              />
              <Search className="w-4 h-4 absolute left-3.5 top-3.5" style={{ color: 'var(--song-muted)' }} />
              {searching ? (
                <Loader2 className="w-4 h-4 animate-spin absolute right-3.5 top-3.5" style={{ color: 'var(--song-accent-text)' }} />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDebouncedQuery('');
                    setSearchError(null);
                  }}
                  className="p-1 rounded-full absolute right-2.5 top-2.5 hover:bg-white/10"
                >
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--song-muted)' }} />
                </button>
              ) : null}
            </div>

            {/* Searching indicator */}
            {searching && (
              <div
                className="p-2.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold animate-pulse"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-muted)',
                }}
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--song-accent-text)' }} />
                <span>กำลังค้นหาศิลปิน &ldquo;{searchQuery}&rdquo; จากระบบและ iTunes...</span>
              </div>
            )}

            {/* Search Error banner */}
            {searchError && (
              <div className="p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold text-rose-300 border-rose-500/30 bg-rose-500/10">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>ค้นหาไม่สำเร็จ: {searchError}</span>
              </div>
            )}

            {/* Not Found Banner */}
            {isNotFound && (
              <div
                className="p-4 rounded-xl border text-center space-y-1 animate-in fade-in"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: 'var(--song-border)',
                }}
              >
                <AlertCircle className="w-5 h-5 mx-auto text-amber-400" />
                <div className="text-xs sm:text-sm font-bold text-white">
                  ไม่พบศิลปินที่ตรงกับ &ldquo;{searchQuery}&rdquo;
                </div>
                <div className="text-[11px]" style={{ color: 'var(--song-muted)' }}>
                  ไม่มีในคลังและไม่พบใน iTunes • ลองตรวจสอบตัวสะกด หรือพิมพ์ชื่อภาษาไทย/อังกฤษให้ถูกต้อง
                </div>
              </div>
            )}

            {/* Quick Action: Add typed query directly if user pressed Enter or clicked button */}
            {searchQuery.trim().length >= 2 && (
              <button
                type="button"
                onClick={() => handleAddOrSync(searchQuery.trim())}
                disabled={addingName !== null}
                className="w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition hover:brightness-110"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--song-accent) 12%, var(--song-surface))',
                  borderColor: 'var(--song-accent)',
                  color: 'var(--song-accent-text)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>ดึงเพลงของ <strong>"{extractSoloArtistName(searchQuery.trim())}"</strong> เข้าคลังทันที</span>
                </div>
                {addingName === extractSoloArtistName(searchQuery.trim()) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              </button>
            )}

            {/* Discovered Artists Grid from Search */}
            {uniqueDiscovered.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-xs font-extrabold uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--song-accent-text)' }}>
                  <span>พบศิลปินใหม่จากออนไลน์ ({uniqueDiscovered.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {uniqueDiscovered.map((art) => {
                    const existingArtist = artists.find(
                      (a) => a.name.toLowerCase() === art.name.toLowerCase()
                    );
                    const isBusy = addingName === art.name;
                    return (
                      <div
                        key={art.id + art.name}
                        className="p-2.5 rounded-xl border flex items-center justify-between gap-2 transition hover:border-white/20"
                        style={{
                          backgroundColor: 'var(--song-surface-soft)',
                          borderColor: 'var(--song-border)',
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {art.avatarUrl ? (
                            <img
                              src={art.avatarUrl}
                              alt={art.name}
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                              style={{
                                backgroundColor: 'var(--song-surface)',
                                color: 'var(--song-muted)',
                              }}
                            >
                              {art.name.slice(0, 1)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">{art.name}</div>
                            <div className="text-[10px]" style={{ color: 'var(--song-muted)' }}>
                              {art.category === 'thai' ? '🇹🇭 เพลงไทย' : '🌍 สากล'} • {art.mainGenre}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {existingArtist ? (
                            <span
                              className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border opacity-80"
                              style={{
                                backgroundColor: 'var(--song-surface)',
                                borderColor: 'var(--song-border)',
                                color: 'var(--song-accent-text)',
                              }}
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>ในคลังแล้ว</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy || syncingArtistId !== null}
                              onClick={() =>
                                handleAddOrSync(art.name, art.category, art.mainGenre, art.avatarUrl)
                              }
                              className="px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 transition disabled:opacity-50 hover:brightness-110"
                              style={{
                                backgroundColor: 'var(--song-accent)',
                                color: 'var(--song-accent-on)',
                              }}
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>เพิ่มศิลปิน</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Saved Artists in Library */}
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--song-border)' }}>
            <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              <span>
                {searchQuery.trim()
                  ? `ศิลปินในคลังที่ตรงกับคำค้นหา (${filteredLibrary.length})`
                  : `ศิลปินในคลังทั้งหมด (${artists.length} ศิลปิน)`}
              </span>
            </div>

            {searchQuery.trim() && filteredLibrary.length === 0 ? (
              <div
                className="py-3 px-3 rounded-xl border border-dashed text-center text-xs"
                style={{ borderColor: 'var(--song-border)', color: 'var(--song-muted)' }}
              >
                ไม่มีศิลปินชื่อ &ldquo;{searchQuery}&rdquo; อยู่ในคลังเดิมของคุณ
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {filteredLibrary.map((artist) => {
                  const trackCount = artist.trackCount ?? 10;

                  return (
                  <div
                    key={artist.id + artist.name}
                    className="p-2.5 rounded-xl border flex items-center justify-between gap-2"
                    style={{
                      backgroundColor: 'var(--song-surface-soft)',
                      borderColor: 'var(--song-border)',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {artist.avatarUrl ? (
                        <img
                          src={artist.avatarUrl}
                          alt={artist.name}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0"
                          style={{
                            backgroundColor: 'var(--song-surface)',
                            color: 'var(--song-muted)',
                          }}
                        >
                          {artist.name.slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{artist.name}</div>
                        <div className="text-[10px] whitespace-nowrap truncate" style={{ color: 'var(--song-muted)' }}>
                          {artist.category === 'thai' ? '🇹🇭' : '🌍'} {artist.mainGenre} •{' '}
                          <span className="font-bold" style={{ color: 'var(--song-accent-text)' }}>
                            {trackCount} เพลง
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onPlayArtist(artist);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition hover:brightness-110"
                        style={{
                          backgroundColor: 'var(--song-accent)',
                          color: 'var(--song-accent-on)',
                        }}
                        title={`เล่นโหมดศิลปิน ${artist.name}`}
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>เล่น</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};
