'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Check,
  Crown,
  Flame,
  Loader2,
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
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS, invalidateLeaderboard } from '../lib/queryClient';

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
const DIFFICULTY_FILTER_OPTIONS: Array<DifficultyLevel | 'all'> = [
  'all',
  'easy',
  'medium',
  'hard',
  'expert',
  'impossible',
];

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
  const [diffFilter, setDiffFilter] = useState<DifficultyLevel | 'all'>(currentDifficulty);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // TanStack Query: Real-time leaderboard filtered by category and difficulty
  const { data: entries = [], isLoading: loading } = useQuery<LeaderboardEntry[]>({
    queryKey: QUERY_KEYS.leaderboard(category, diffFilter),
    queryFn: async () => {
      const diffParam = diffFilter !== 'all' ? `&difficulty=${diffFilter}` : '';
      const res = await fetch(`/api/leaderboard?category=${category}${diffParam}`);
      const json = await res.json();
      if (json.code === 0 && Array.isArray(json.data)) {
        return json.data;
      }
      return [];
    },
    enabled: isOpen,
    staleTime: 1000 * 30,
  });

  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_PLAYER_NAME) || '';
    } catch {
      return '';
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState('');

  const calculatedScore =
    isDailyMode && dailyScore != null
      ? dailyScore
      : Math.max(100, bestStreak * 85 + (fastestTime ? Math.round((15 - fastestTime) * 15) : 0));

  // Unique session key for current score to prevent duplicate submissions
  const scoreSessionKey = `beatdrop_lb_sub_${category}_${currentDifficulty}_${calculatedScore}`;

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDiffFilter(currentDifficulty);
      setSubmittedMsg('');
      try {
        const alreadySubmitted = sessionStorage.getItem(scoreSessionKey) === 'true';
        setHasSubmitted(alreadySubmitted);
      } catch {
        setHasSubmitted(false);
      }
    }
  }, [isOpen, currentDifficulty, scoreSessionKey]);

  const fetchLeaderboard = useCallback(async () => {
    await invalidateLeaderboard();
  }, []);

  if (!isOpen) return null;

  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || submitting || hasSubmitted) return;
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
          difficulty: currentDifficulty, // Strictly locked to current game difficulty (cannot create cross-difficulty)
          category,
          isDaily: Boolean(isDailyMode),
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        setHasSubmitted(true);
        setSubmittedMsg('บันทึกคะแนนขึ้นตารางอันดับสำเร็จ!');
        try {
          sessionStorage.setItem(scoreSessionKey, 'true');
        } catch {}
        await invalidateLeaderboard();
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

        {/* Filter Bar: Difficulty Tabs & Locked Category Badge */}
        <div
          className="px-3.5 py-2.5 sm:px-6 sm:py-3 border-b flex flex-wrap items-center justify-between gap-2"
          style={{
            backgroundColor: 'var(--song-surface-soft)',
            borderColor: 'var(--song-border)',
          }}
        >
          {/* Difficulty Filter Tabs */}
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-0.5 max-w-full">
            {DIFFICULTY_FILTER_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDiffFilter(d)}
                className="px-2.5 sm:px-3 py-1 rounded-xl text-[10px] sm:text-xs font-bold transition shrink-0"
                style={
                  diffFilter === d
                    ? {
                        backgroundColor: 'var(--song-accent)',
                        color: 'var(--song-accent-on)',
                      }
                    : {
                        color: 'var(--song-muted)',
                        backgroundColor: 'var(--song-surface)',
                      }
                }
              >
                {d === 'all' ? 'ทั้งหมด' : DIFFICULTY_PRESETS[d]?.label || d}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold shadow-sm"
              style={{
                backgroundColor: 'var(--song-surface)',
                borderColor: 'var(--song-border)',
                color: 'var(--song-accent-text)',
              }}
              title="ตารางอันดับถูกล็อกตามหมวดหมู่เพลงที่เลือกเล่น"
            >
              <span style={{ color: 'var(--song-muted)' }}>หมวดหมู่:</span>
              <span>
                {category === 'thai'
                  ? '🇹🇭 เพลงไทย'
                  : category === 'international'
                    ? '🌍 เพลงสากล'
                    : '🎵 ทั้งหมด'}
              </span>
            </div>
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

        {/* Submit Player Score Section (Allowed only ONCE per round/session) */}
        {hasSubmitted ? (
          <div
            className="px-4 py-3 sm:px-6 sm:py-3.5 border-b flex items-center justify-between gap-2"
            style={{
              backgroundColor: 'color-mix(in srgb, #22c55e 12%, var(--song-surface))',
              borderColor: 'rgba(34, 197, 94, 0.3)',
              color: '#4ade80',
            }}
          >
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>คุณได้ส่งคะแนนของรอบนี้แล้ว ({calculatedScore} pts)</span>
            </div>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-lg border border-emerald-500/30 bg-emerald-500/20"
            >
              ระดับ: {DIFFICULTY_PRESETS[currentDifficulty]?.label || currentDifficulty}
            </span>
          </div>
        ) : (
          <form
            onSubmit={handleSubmitScore}
            className="px-3.5 py-2.5 sm:px-6 sm:py-3 border-b flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
            style={{ borderColor: 'var(--song-border)' }}
          >
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="กรอกชื่อของคุณเพื่อส่งคะแนน..."
                maxLength={24}
                disabled={submitting}
                className="flex-1 px-3 py-2 rounded-xl border text-base sm:text-xs font-semibold focus:outline-none"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
              />
              <div
                className="px-2.5 py-1 rounded-lg border text-[11px] font-bold shrink-0 flex items-center gap-1"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: 'var(--song-border)',
                  color: DIFFICULTY_PRESETS[currentDifficulty]?.accentText || 'var(--song-accent-text)',
                }}
                title={`คะแนนของคุณจะถูกบันทึกในระดับ ${currentDifficulty} เท่านั้น`}
              >
                <span className="opacity-60 text-[10px]">ระดับ:</span>
                <span>{DIFFICULTY_PRESETS[currentDifficulty]?.label || currentDifficulty}</span>
              </div>
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
        )}

        {submittedMsg && !hasSubmitted && (
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
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2.5">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
              <span className="text-xs font-bold" style={{ color: 'var(--song-muted)' }}>
                กำลังโหลดอันดับคะแนน...
              </span>
            </div>
          ) : entries.length === 0 ? (
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
                    borderColor:
                      rank === 1
                        ? 'color-mix(in srgb, #eab308 50%, var(--song-border))'
                        : rank === 2
                          ? 'color-mix(in srgb, #94a3b8 40%, var(--song-border))'
                          : rank === 3
                            ? 'color-mix(in srgb, #b45309 40%, var(--song-border))'
                            : 'var(--song-border)',
                  }}
                >
                  {/* Rank Badge & Player Info */}
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl flex items-center justify-center font-black text-xs shrink-0"
                      style={
                        rank === 1
                          ? { backgroundColor: '#eab308', color: '#000' }
                          : rank === 2
                            ? { backgroundColor: '#94a3b8', color: '#000' }
                            : rank === 3
                              ? { backgroundColor: '#b45309', color: '#fff' }
                              : {
                                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                  color: 'var(--song-muted)',
                                }
                      }
                    >
                      {rank === 1 ? (
                        <Crown className="w-3.5 h-3.5" />
                      ) : rank === 2 ? (
                        <Medal className="w-3.5 h-3.5" />
                      ) : rank === 3 ? (
                        <Award className="w-3.5 h-3.5" />
                      ) : (
                        `#${rank}`
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-xs sm:text-sm truncate">
                          {entry.playerName}
                        </span>
                        <span
                          className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded border"
                          style={{
                            backgroundColor: 'color-mix(in srgb, var(--badge-rgb, #ffffff) 15%, transparent)',
                            borderColor: 'color-mix(in srgb, var(--badge-rgb, #ffffff) 30%, transparent)',
                            color: diffPreset.accentText,
                            ['--badge-rgb' as any]: diffPreset.accent,
                          }}
                        >
                          {diffPreset.label}
                        </span>
                        {entry.category === 'thai' ? (
                          <span className="text-[10px]" title="เพลงไทย">
                            🇹🇭
                          </span>
                        ) : entry.category === 'international' ? (
                          <span className="text-[10px]" title="เพลงสากล">
                            🌍
                          </span>
                        ) : null}
                        {rank <= 3 && <Flame className="w-3 h-3 text-orange-400 fill-orange-400 shrink-0" />}
                      </div>

                      <div
                        className="text-[10px] sm:text-[11px] flex items-center gap-2 mt-0.5"
                        style={{ color: 'var(--song-muted)' }}
                      >
                        <span className="flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" />
                          <span>Streak: {entry.streak}</span>
                        </span>
                        <span>•</span>
                        <span>ไวสุด: {entry.fastestSeconds}s</span>
                      </div>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    <div
                      className="font-black text-sm sm:text-base font-mono leading-none"
                      style={{ color: 'var(--song-accent-text)' }}
                    >
                      {entry.score.toLocaleString()}
                    </div>
                    <div
                      className="text-[9px] uppercase tracking-wider font-bold mt-0.5"
                      style={{ color: 'var(--song-muted)' }}
                    >
                      pts
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

