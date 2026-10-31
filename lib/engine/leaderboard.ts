import { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { CategoryType, DifficultyLevel, LeaderboardEntry } from '../../shared/types';
import { dbService } from '../db';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

export const SEED_LEADERBOARD: LeaderboardEntry[] = [
  { id: 'lb-1', playerName: 'MelodyKing_TH', score: 980, streak: 18, fastestSeconds: 0.1, difficulty: 'impossible', category: 'thai', isDaily: true, createdAt: '2026-10-29T04:10:00Z' },
  { id: 'lb-2', playerName: 'SwiftieForever', score: 950, streak: 14, fastestSeconds: 0.2, difficulty: 'expert', category: 'international', isDaily: true, createdAt: '2026-10-29T04:15:00Z' },
  { id: 'lb-3', playerName: 'NontFam99', score: 910, streak: 12, fastestSeconds: 0.5, difficulty: 'hard', category: 'thai', isDaily: false, createdAt: '2026-10-29T04:22:00Z' },
  { id: 'lb-4', playerName: 'VinylCollector', score: 870, streak: 10, fastestSeconds: 1, difficulty: 'medium', category: 'all', isDaily: true, createdAt: '2026-10-29T04:30:00Z' },
  { id: 'lb-5', playerName: 'TPopHunter', score: 840, streak: 9, fastestSeconds: 0.5, difficulty: 'hard', category: 'thai', isDaily: false, createdAt: '2026-10-29T04:45:00Z' },
  { id: 'lb-6', playerName: 'BangkokBeats', score: 790, streak: 7, fastestSeconds: 1, difficulty: 'medium', category: 'thai', isDaily: true, createdAt: '2026-10-29T05:00:00Z' },
  { id: 'lb-7', playerName: 'IndieVibes', score: 750, streak: 6, fastestSeconds: 2, difficulty: 'medium', category: 'international', isDaily: false, createdAt: '2026-10-29T05:10:00Z' },
];

export let leaderboardEntries: LeaderboardEntry[] = [];

export function loadLeaderboard(): void {
  dbService.migrateFromJsonFiles(DATA_DIR, SEED_LEADERBOARD);
  try {
    const dbEntries = dbService.getLeaderboard();
    if (dbEntries.length > 0) {
      leaderboardEntries = dbEntries;
      return;
    }
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        leaderboardEntries = parsed;
        return;
      }
    }
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
  }
  leaderboardEntries = [...SEED_LEADERBOARD];
  saveLeaderboard();
}

export function saveLeaderboard(): void {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboardEntries, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save leaderboard:', err);
  }
}

export function handleGetLeaderboard(req: Request, res: Response): void {
  loadLeaderboard();
  const category = (req.query.category as CategoryType) || 'all';
  const mode = (req.query.mode as string) || 'all';

  let list = [...leaderboardEntries];
  if (category === 'thai' || category === 'international') {
    list = list.filter((e) => e.category === category || e.category === 'all');
  }
  if (mode === 'daily') {
    list = list.filter((e) => e.isDaily);
  }

  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.streak !== a.streak) return b.streak - a.streak;
    return a.fastestSeconds - b.fastestSeconds;
  });

  res.json({ code: 0, message: 'ok', data: list.slice(0, 50) });
}

export function handlePostLeaderboard(req: Request, res: Response): void {
  loadLeaderboard();
  const {
    playerName,
    score = 100,
    streak = 1,
    fastestSeconds = 1,
    difficulty = 'medium',
    category = 'thai',
    isDaily = false,
  } = req.body || {};

  const cleanName = String(playerName || 'Anonymous Player').trim().slice(0, 24) || 'Player';
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const existingIdx = leaderboardEntries.findIndex(
    (e) => e.playerName.toLowerCase() === cleanName.toLowerCase() && Boolean(e.isDaily) === Boolean(isDaily)
  );

  const entry: LeaderboardEntry = {
    id: `lb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    playerName: cleanName,
    score: Number(score) || 0,
    streak: Number(streak) || 0,
    fastestSeconds: Number(fastestSeconds) || 1,
    difficulty: difficulty as DifficultyLevel,
    category: category as CategoryType,
    isDaily: Boolean(isDaily),
    dateKey,
    createdAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    const prev = leaderboardEntries[existingIdx];
    leaderboardEntries[existingIdx] = {
      ...prev,
      score: Math.max(prev.score, entry.score),
      streak: Math.max(prev.streak, entry.streak),
      fastestSeconds: Math.min(prev.fastestSeconds, entry.fastestSeconds),
      difficulty: entry.difficulty,
      category: entry.category,
      dateKey,
      createdAt: entry.createdAt,
    };
  } else {
    leaderboardEntries.push(entry);
  }

  saveLeaderboard();
  dbService.addLeaderboardEntry(entry);
  res.json({ code: 0, message: 'ok', data: entry });
}

