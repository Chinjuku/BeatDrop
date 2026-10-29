import React, { useEffect, useState } from 'react';
import {
  Check,
  Loader2,
  Mic2,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Artist, GENRE_OPTIONS } from '../../../shared/types';

interface AddArtistModalProps {
  isOpen: boolean;
  onClose: () => void;
  artists: Artist[];
  onArtistAdded: (artist: Artist) => void;
  onArtistRemoved: (id: string) => void;
  onPlayArtist: (artist: Artist) => void;
}

export const AddArtistModal: React.FC<AddArtistModalProps> = ({
  isOpen,
  onClose,
  artists,
  onArtistAdded,
  onArtistRemoved,
  onPlayArtist,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [discovered, setDiscovered] = useState<Artist[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingName, setAddingName] = useState<string | null>(null);

  // Manual form state
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<'thai' | 'international'>('thai');
  const [customGenre, setCustomGenre] = useState('T-Pop');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || searchQuery.trim().length < 2) {
      setDiscovered([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/artists?q=${encodeURIComponent(searchQuery)}&discover=true`
        );
        const json = await res.json();
        if (json.code === 0) {
          setDiscovered(json.data || []);
        }
      } catch (err) {
        console.error('Artist discovery error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen]);

  if (!isOpen) return null;

  const handleAddArtist = async (
    name: string,
    category: 'thai' | 'international',
    mainGenre: string,
    avatarUrl = ''
  ) => {
    if (!name.trim()) return;
    setAddingName(name);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/artists/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          mainGenre,
          avatarUrl,
        }),
      });
      const json = await res.json();
      if (json.code === 0 && json.data) {
        onArtistAdded(json.data);
        setFeedbackMsg(
          `เพิ่มศิลปิน "${json.data.name}" พร้อมดึงเพลงเข้าคลัง (${json.data.trackCount || 15}+ เพลง) เรียบร้อย!`
        );
        setCustomName('');
      }
    } catch {
      // Fallback localStorage artist object
      const fallback: Artist = {
        id: `local-${Date.now()}`,
        name: name.trim(),
        category,
        mainGenre,
        avatarUrl:
          avatarUrl ||
          'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200',
        isCustom: true,
        trackCount: 10,
      };
      onArtistAdded(fallback);
      setFeedbackMsg(`เพิ่มศิลปิน "${fallback.name}" ลงในเครื่องเรียบร้อย!`);
    } finally {
      setAddingName(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Add and Manage Artists"
    >
      <div
        className="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
          color: 'var(--song-text)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--song-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <Mic2 className="w-5 h-5" style={{ color: 'var(--song-accent-text)' }} />
            <div>
              <h2 className="text-base font-extrabold">
                เพิ่มและจัดการศิลปิน (Add / Manage Artists)
              </h2>
              <p className="text-xs" style={{ color: 'var(--song-muted)' }}>
                ค้นหาศิลปินใหม่จาก iTunes API เพื่อดึงเพลงเข้าคลังและเล่นโหมดทายตามศิลปินได้ทันที
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {feedbackMsg && (
            <div
              className="p-3 rounded-xl border text-xs font-bold flex items-center gap-2"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--song-accent) 16%, transparent)',
                borderColor: 'var(--song-accent)',
                color: 'var(--song-accent-text)',
              }}
            >
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>{feedbackMsg}</span>
            </div>
          )}

          {/* 1. Search & One-Click Add from API */}
          <div className="space-y-2.5">
            <label className="block text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--song-accent-text)' }}>
              1. ค้นหาศิลปินจาก API อัตโนมัติ (ไทย & สากล)
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="พิมพ์ชื่อศิลปิน เช่น BUS, Pun, Lomosonic, Oasis, Ado, Lauv..."
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border text-xs sm:text-sm font-medium focus:outline-none"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              />
              <Search className="w-4 h-4 absolute left-3 top-3" style={{ color: 'var(--song-muted)' }} />
              {searching && (
                <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3" style={{ color: 'var(--song-accent-text)' }} />
              )}
            </div>

            {discovered.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-48 overflow-y-auto">
                {discovered.map((art) => {
                  const alreadyInPool = artists.some(
                    (a) => a.name.toLowerCase() === art.name.toLowerCase()
                  );
                  const isBusy = addingName === art.name;
                  return (
                    <div
                      key={art.id + art.name}
                      className="p-2.5 rounded-xl border flex items-center justify-between gap-2"
                      style={{
                        backgroundColor: 'var(--song-surface-soft)',
                        borderColor: 'var(--song-border)',
                      }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={art.avatarUrl}
                          alt={art.name}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{art.name}</div>
                          <div className="text-[10px]" style={{ color: 'var(--song-muted)' }}>
                            {art.category === 'thai' ? '🇹🇭 เพลงไทย' : '🌍 สากล'} • {art.mainGenre}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleAddArtist(art.name, art.category, art.mainGenre, art.avatarUrl)
                          }
                          className="px-2.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 transition"
                          style={{
                            backgroundColor: alreadyInPool
                              ? 'var(--song-surface)'
                              : 'var(--song-accent)',
                            color: alreadyInPool
                              ? 'var(--song-accent-text)'
                              : 'var(--song-accent-on)',
                          }}
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : alreadyInPool ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>ซิงก์เพลงเพิ่ม</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>เพิ่มศิลปิน</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Custom Manual Add Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddArtist(customName, customCategory, customGenre);
            }}
            className="p-4 rounded-xl border space-y-3"
            style={{
              backgroundColor: 'var(--song-surface-soft)',
              borderColor: 'var(--song-border)',
            }}
          >
            <div className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--song-accent-text)' }}>
              2. หรือระบุข้อมูลศิลปินเอง (Custom Artist Setup)
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="ชื่อศิลปิน (เช่น Silly Fools)"
                className="px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              />

              <select
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value as 'thai' | 'international')}
                className="px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              >
                <option value="thai">🇹🇭 เพลงไทย (Thai Music)</option>
                <option value="international">🌍 เพลงสากล (International)</option>
              </select>

              <select
                value={customGenre}
                onChange={(e) => setCustomGenre(e.target.value)}
                className="px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              >
                {GENRE_OPTIONS.filter((g) => g !== 'any').map((g) => (
                  <option key={g} value={g}>
                    แนวเพลง: {g}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={!customName.trim() || addingName !== null}
              className="w-full py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition hover:brightness-110 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--song-accent)',
                color: 'var(--song-accent-on)',
              }}
            >
              {addingName ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>บันทึกศิลปินและดึงเพลงจาก API เข้าคลัง</span>
            </button>
          </form>

          {/* 3. Saved Artists Pool */}
          <div className="space-y-2">
            <div className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              ศิลปินในคลังทั้งหมด ({artists.length} ศิลปิน)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
              {artists.map((artist) => (
                <div
                  key={artist.id + artist.name}
                  className="p-2 rounded-xl border flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={artist.avatarUrl}
                      alt={artist.name}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{artist.name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--song-muted)' }}>
                        {artist.category === 'thai' ? '🇹🇭' : '🌍'} {artist.mainGenre} •{' '}
                        {artist.trackCount ?? 10} เพลง
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onPlayArtist(artist);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1"
                      style={{
                        backgroundColor: 'var(--song-accent)',
                        color: 'var(--song-accent-on)',
                      }}
                      title={`เล่นโหมดศิลปิน ${artist.name}`}
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>เล่น</span>
                    </button>
                    {artist.isCustom && (
                      <button
                        type="button"
                        onClick={() => onArtistRemoved(artist.id)}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10"
                        title="ลบศิลปินนี้"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

