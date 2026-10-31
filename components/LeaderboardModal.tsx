'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Crown,
  Flame,
  Medal,
  RefreshCw,
  Send,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import {
  CategoryType,
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  LeaderboardEntry,
} from '../types';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: CategoryType;
  currentStreak: number;
  bestStreak: number;
  fastestTime: number | null;
  currentDifficulty: DifficultyLevel;
  dailyScore?: number | null;
  isDailyMode?: boolean;
}

const STORAGE_PLAYER_NAME = 'songspot:player-name';

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  category,
  currentStreak,
  bestStreak,
  fastestTime,
  currentDifficulty,
  dailyScore,
  isDailyMode = false,
}) => {
  const [tab, setTab] = useState<'all' | 'daily'>(isDailyMode ? 'daily' : 'all');
  const [catFilter, setCatFilter] = useState<CategoryType>(category);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_PLAYER_NAME) || '';
    } catch {
      return '';
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState('');

  // Sync category and tab default when modal opens
  useEffect(() => {
    if (isOpen) {
      setCatFilter(category);
      if (isDailyMode) {
        setTab('daily');
      }
    }
  }, [isOpen, category, isDailyMode]);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?category=${catFilter}&mode=${tab}`);
      const json = await res.json();
      if (json.code === 0 && Array.isArray(json.data)) {
        setEntries(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }, [catFilter, tab]);

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboard();
      setSubmittedMsg('');
    }
  }, [isOpen, fetchLeaderboard]);

  if (!isOpen) return null;

  const calculatedScore =
    tab === 'daily' && dailyScore != null
      ? dailyScore
      : Math.max(100, bestStreak * 85 + (fastestTime ? Math.round((15 - fastestTime) * 15) : 0));

  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    setSubmitting(true);
    try {
      localStorage.setItem(STORAGE_PLAYER_NAME, playerName.trim());
    } catch {}

    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: playerName.trim(),
          score: calculatedScore,
          streak: Math.max(currentStreak, bestStreak, 1),
          fastestSeconds: fastestTime ?? 3,
          difficulty: currentDifficulty,
          category: catFilter === 'all' ? category : catFilter,
          isDaily: tab === 'daily',
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        setSubmittedMsg('บันทึกคะแนนขึ้นตารางอันดับสำเร็จ!');
        await fetchLeaderboard();
      } else {
        setSubmittedMsg(json.message || 'เกิดข้อผิดพลาดในการส่งคะแนน');
      }
    } catch {
      setSubmittedMsg('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto overflow-x-hidden animate-in fade-in duration-200">
      <div
        className="w-[calc(100vw-16px)] sm:w-full max-w-xl md:max-w-2xl rounded-2xl sm:rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] my-auto relative animate-in zoom-in-95 duration-200"
        style={{
          backgroundColor: 'var(--song-surface)',
          borderColor: 'var(--song-border)',
          color: 'var(--song-text)',
        }}
      >
        {/* Header */}
        <div
          className="px-3.5 py-3 sm:px-6 sm:py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--song-border)' }}
        >
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--song-accent) 18%, transparent)',
                color: 'var(--song-accent-text)',
              }}
            >
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                Songspot Leaderboard (ตารางอันดับ)
              </h2>
              <p className="text-[10px] sm:text-xs truncate" style={{ color: 'var(--song-muted)' }}>
                ผู้เล่นสายทายเพลงที่แม่นและไวที่สุด
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 transition flex-shrink-0"
            aria-label="Close Leaderboard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode & Category Filter Tabs */}
        <div
          className="px-3.5 py-2.5 sm:px-6 sm:py-3 border-b flex flex-wrap items-center justify-between gap-2"
          style={{
            backgroundColor: 'var(--song-surface-soft)',
            borderColor: 'var(--song-border)',
          }}
        >
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => setTab('all')}
              className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition"
              style={
                tab === 'all'
                  ? {
                      backgroundColor: 'var(--song-accent)',
                      color: 'var(--song-accent-on)',
                    }
                  : { color: 'var(--song-muted)' }
              }
            >
              🏆 รวม (Global)
            </button>
            <button
              type="button"
              onClick={() => setTab('daily')}
              className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition"
              style={
                tab === 'daily'
                  ? {
                      backgroundColor: 'var(--song-accent)',
                      color: 'var(--song-accent-on)',
                    }
                  : { color: 'var(--song-muted)' }
              }
            >
              📅 รายวัน (Daily)
            </button>
          </div>

          <div className="flex items-center gap-1">
            {(['all', 'thai', 'international'] as CategoryType[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCatFilter(c)}
                className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-[11px] font-bold border transition"
                style={
                  catFilter === c
                    ? {
                        borderColor: 'var(--song-accent)',
                        color: 'var(--song-accent-text)',
                        backgroundColor: 'var(--song-surface)',
                      }
                    : {
                        borderColor: 'transparent',
                        color: 'var(--song-muted)',
                      }
                }
              >
                {c === 'all' ? 'ทั้งหมด' : c === 'thai' ? '🇹🇭 ไทย' : '🌍 สากล'}
              </button>
            ))}
            <button
              type="button"
              onClick={fetchLeaderboard}
              className="p-1 sm:p-1.5 rounded-lg hover:bg-white/10 transition"
              title="รีเฟรชอันดับ"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Submit Player Score Form */}
        <form
          onSubmit={handleSubmitScore}
          className="px-3.5 py-2.5 sm:px-6 sm:py-3 border-b flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          style={{ borderColor: 'var(--song-border)' }}
        >
          <div className="flex-1">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="กรอกชื่อของคุณเพื่อส่งคะแนน..."
              maxLength={24}
              className="w-full px-3 py-2 rounded-xl border text-base sm:text-xs font-semibold focus:outline-none"
              style={{
                backgroundColor: 'var(--song-surface-soft)',
                borderColor: 'var(--song-border)',
                color: 'var(--song-text)',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !playerName.trim()}
            className="px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition hover:brightness-110 disabled:opacity-50 min-h-[38px] active:scale-95"
            style={{
              backgroundColor: 'var(--song-accent)',
              color: 'var(--song-accent-on)',
            }}
          >
            <Send className="w-3.5 h-3.5" />
            <span>ส่งคะแนน ({calculatedScore} pts)</span>
          </button>
        </form>
        {submittedMsg && (
          <div
            className="px-4 py-1.5 text-center text-xs font-bold"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--song-accent) 15%, transparent)',
              color: 'var(--song-accent-text)',
            }}
          >
            {submittedMsg}
          </div>
        )}

        {/* Rankings Table */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-1.5 sm:space-y-2">
          {entries.length === 0 ? (
            <div className="py-12 text-center text-xs" style={{ color: 'var(--song-muted)' }}>
              ยังไม่มีข้อมูลอันดับในหมวดนี้ มาร่วมประเดิมส่งคะแนนคนแรกกันเลย!
            </div>
          ) : (
            entries.map((entry, idx) => {
              const rank = idx + 1;
              const diffPreset =
                DIFFICULTY_PRESETS[entry.difficulty] || DIFFICULTY_PRESETS.medium;
              return (
                <div
                  key={entry.id}
                  className="px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-2xl border flex items-center justify-between gap-2.5 sm:gap-3 transition"
                  style={{
                    backgroundColor:
                      rank <= 3
                        ? 'color-mix(in srgb, var(--song-accent) 7%, var(--song-surface-soft))'
                        : 'var(--song-surface-soft)',
                    borderColor: rank === 1 ? 'var(--song-accent)' : 'var(--song-border)',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 text-center font-extrabold text-sm flex justify-center">
                      {rank === 1 ? (
                        <Crown className="w-5 h-5 text-amber-400 fill-amber-400/20" />
                      ) : rank === 2 ? (
                        <Medal className="w-5 h-5 text-slate-300" />
                      ) : rank === 3 ? (
                        <Award className="w-5 h-5 text-amber-600" />
                      ) : (
                        <span style={{ color: 'var(--song-muted)' }}>#{rank}</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-extrabold truncate">
                          {entry.playerName}
                        </span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${diffPreset.accent} 18%, transparent)`,
                            color: diffPreset.accentText,
                          }}
                        >
                          {diffPreset.label}
                        </span>
                        <span className="text-[10px]">
                          {entry.category === 'thai'
                            ? '🇹🇭'
                            : entry.category === 'international'
                              ? '🌍'
                              : '🔥'}
                        </span>
                      </div>
                      <div
                        className="flex items-center gap-3 text-[11px] mt-0.5"
                        style={{ color: 'var(--song-muted)' }}
                      >
                        <span className="flex items-center gap-1">
                          <Flame className="w-3 h-3 text-orange-400" />
                          Streak: {entry.streak}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-emerald-400" />
                          ไวสุด: {entry.fastestSeconds}s
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div
                      className="text-sm sm:text-base font-extrabold font-mono"
                      style={{ color: 'var(--song-accent-text)' }}
                    >
                      {entry.score.toLocaleString()}
                    </div>
                    <div className="text-[10px] uppercase" style={{ color: 'var(--song-muted)' }}>
                      PTS
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

