import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import {
  Compass,
  Play,
  ListChecks,
  Sparkles,
  Calendar,
  Mic2,
  Radio,
  Flame,
  ArrowRight,
  Search,
} from 'lucide-react';
import { GameMode } from '../../../shared/types';

export const MusicQuizzesPage: React.FC = () => {
  const navigate = useNavigate();
  const { config, handleConfigChange, artists } = useGame();
  const [selectedTab, setSelectedTab] = useState<'genres' | 'eras' | 'artists'>('genres');
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleLaunchQuiz = (mode: GameMode, filters: { genre?: string; year?: string; artist?: string }) => {
    handleConfigChange(
      {
        ...config,
        mode,
        genreFilter: filters.genre || 'any',
        yearFilter: filters.year || 'any',
        artistName: filters.artist,
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-2 text-xs font-bold"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--song-accent) 15%, transparent)',
            borderColor: 'var(--song-accent)',
            color: 'var(--song-accent-text)',
          }}
        >
          <Compass className="w-4 h-4" />
          <span>MUSIC QUIZZES EXPLORER</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
          เลือกหมวดหมู่เพลงที่คุณเชี่ยวชาญ
        </h1>
        <p className="text-xs sm:text-sm mt-1.5 opacity-70" style={{ color: 'var(--song-muted)' }}>
          ท้าทายความจำด้วยการฟังเสี้ยววินาที หรือตอบแบบ 4 ตัวเลือก ในแนวเพลง ยุคสมัย หรือศิลปินที่คุณชื่นชอบ
        </p>
      </div>

      {/* Segmented Filter Switcher */}
      <div
        className="flex items-center gap-2 p-1.5 rounded-2xl border mb-6"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedTab('genres')}
          className="px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition"
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
          <Radio className="w-4 h-4" />
          <span>แนวเพลง (Genres)</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('eras')}
          className="px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition"
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
          <Calendar className="w-4 h-4" />
          <span>ยุคสมัย (Decades)</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('artists')}
          className="px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition"
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
          <Mic2 className="w-4 h-4" />
          <span>ศิลปิน (Artists)</span>
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
            placeholder="ค้นหาแนวเพลง ยุคสมัย หรือศิลปิน..."
            className="w-full bg-transparent border-0 outline-none text-xs sm:text-sm font-semibold placeholder:opacity-50"
            style={{ color: 'var(--song-text)' }}
          />
        </div>
      </div>

      {/* Tab 1: Genres */}
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

      {/* Tab 2: Eras */}
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

      {/* Tab 3: Artists */}
      {selectedTab === 'artists' && (
        <div className="w-full space-y-4">
          <div className="p-4 rounded-2xl border flex items-center justify-between"
            style={{
              backgroundColor: 'var(--song-surface)',
              borderColor: 'var(--song-border)',
            }}
          >
            <div>
              <h3 className="text-sm font-extrabold">ทายเพลงเฉพาะศิลปินคนโปรด</h3>
              <p className="text-xs opacity-75" style={{ color: 'var(--song-muted)' }}>
                เลือกศิลปินเพื่อทายเฉพาะเพลงในผลงานของศิลปินท่านนั้น (คลังทั้งหมด {artists.length} ศิลปิน)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {(searchQuery.trim()
              ? artists.filter(
                  (a) =>
                    a.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                    (a.mainGenre || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
                )
              : artists
            ).map((art) => (
              <button
                key={art.id + art.name}
                type="button"
                onClick={() => handleLaunchQuiz('artist', { artist: art.name })}
                className="p-3 rounded-xl border text-left flex items-center gap-2.5 transition hover:scale-[1.02] hover:border-[var(--song-accent)] group"
                style={{
                  backgroundColor: 'var(--song-surface)',
                  borderColor: 'var(--song-border)',
                }}
              >
                <div className="w-8 h-8 rounded-full bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center font-bold text-xs shrink-0 group-hover:bg-emerald-500 group-hover:text-black transition-colors">
                  <Mic2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-xs truncate group-hover:text-[var(--song-accent-text)]">
                    {art.name}
                  </div>
                  <div className="text-[10px] opacity-60 truncate">
                    {art.mainGenre || (art.category === 'thai' ? 'เพลงไทย' : 'สากล')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

