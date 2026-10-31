export type CategoryType = 'thai' | 'international' | 'all';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert' | 'impossible';

export type GameMode = 'standard' | 'artist' | 'year' | 'genre' | 'daily' | 'guesser';

export type ThemeId =
  | 'songspot-dark'
  | 'spotify-green'
  | 'neon-cyber'
  | 'sunset';

export interface Song {
  id: string;
  title: string;
  artistId?: string;
  artistName: string;
  albumName: string;
  releaseYear: number;
  releaseDate?: string;
  genre: string;
  category: 'thai' | 'international';
  previewUrl: string;
  artworkUrl: string;
  trackViewUrl?: string;
  popularityScore?: number;
}

export interface Artist {
  id: string;
  name: string;
  category: 'thai' | 'international';
  mainGenre: string;
  avatarUrl: string;
  isCustom?: boolean;
  trackCount?: number;
}

export interface DifficultyPreset {
  id: DifficultyLevel;
  label: string;
  labelTh: string;
  description: string;
  stages: number[]; // Snippet durations in seconds
  accent: string;
  accentText: string;
  accentOn: string;
  rgb: string;
  page?: string;
  stage?: string;
  surface?: string;
  surfaceSoft?: string;
  timeline?: string;
}

export type TimeRangePresetId = 'relaxed' | 'standard' | 'songspot' | 'custom';

export interface TimeRangePreset {
  id: TimeRangePresetId;
  label: string;
  labelTh: string;
  stages: number[];
  description: string;
}

export const DEFAULT_TIME_STAGES = [0.5, 2, 6, 8, 15];

export const TIME_RANGE_PRESETS: Record<Exclude<TimeRangePresetId, 'custom'>, TimeRangePreset> = {
  relaxed: {
    id: 'relaxed',
    label: 'Easy / Relaxed',
    labelTh: 'Relaxed (3s → 15s)',
    stages: [3, 5, 10, 15],
    description: '3s, 5s, 10s, 15s • ปลดล็อกช้า ฟังสบาย',
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    labelTh: 'Standard (1s → 15s)',
    stages: [1, 2, 4, 8, 15],
    description: '1s, 2s, 4s, 8s, 15s • มาตรฐานทั่วไป',
  },
  songspot: {
    id: 'songspot',
    label: 'Songspot (Default)',
    labelTh: 'Songspot (0.5s → 10s)',
    stages: [0.5, 2, 6, 8, 15],
    description: '0.5s, 1.5s, 3s, 6s, 10s • ออริจินัล Songspot',
  },
};

export const DIFFICULTY_PRESETS: Record<DifficultyLevel, DifficultyPreset> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    labelTh: 'ง่าย (3s → 15s)',
    description: 'Longer audio snippets (3s, 5s, 10s, 15s) • Popular top-chart hits',
    stages: [3, 5, 10, 15],
    accent: '#19df70',
    accentText: '#39e887',
    accentOn: '#04160b',
    rgb: '25, 223, 112',
    page: '#030704',
    stage: '#0c110d',
    surface: '#151b16',
    surfaceSoft: '#1f2721',
    timeline: '#232924',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    labelTh: 'ปานกลาง (1s → 15s)',
    description: 'Standard snippet progression (1s, 2s, 4s, 8s, 15s) • Mixed catalog',
    stages: [1, 2, 4, 8, 15],
    accent: '#ffca12',
    accentText: '#ffd234',
    accentOn: '#171200',
    rgb: '255, 202, 18',
    page: '#070803',
    stage: '#15160b',
    surface: '#1b1c10',
    surfaceSoft: '#272817',
    timeline: '#2e2e21',
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    labelTh: 'ยาก (0.5s → 10s)',
    description: 'Short clips (0.5s, 1.5s, 3s, 6s, 10s) • Deeper cuts',
    stages: [0.5, 2, 6, 8, 15],
    accent: '#ff7517',
    accentText: '#ff8631',
    accentOn: '#190900',
    rgb: '255, 117, 23',
    page: '#080503',
    stage: '#171009',
    surface: '#1d150f',
    surfaceSoft: '#2a1e15',
    timeline: '#302820',
  },
  expert: {
    id: 'expert',
    label: 'Expert',
    labelTh: 'เชี่ยวชาญ (0.2s → 6s)',
    description: 'Rapid clips (0.2s, 0.5s, 1.5s, 3s, 6s) • Challenging tracks',
    stages: [0.2, 0.5, 1.5, 3, 6],
    accent: '#f04444',
    accentText: '#f66464',
    accentOn: '#1b0505',
    rgb: '240, 68, 68',
    page: '#070304',
    stage: '#160c0c',
    surface: '#1c1111',
    surfaceSoft: '#281919',
    timeline: '#2e2323',
  },
  impossible: {
    id: 'impossible',
    label: 'Impossible',
    labelTh: 'ระดับเทพ (0.1s → 4s)',
    description: 'Ultra-short 0.1s opening clip (0.1s, 0.3s, 0.8s, 2s, 4s) • True fans only',
    stages: [0.1, 0.3, 0.8, 2, 4],
    accent: '#9748dd',
    accentText: '#ae67ed',
    accentOn: '#14061e',
    rgb: '151, 72, 221',
    page: '#050307',
    stage: '#140c16',
    surface: '#1a111d',
    surfaceSoft: '#25182a',
    timeline: '#29232e',
  },
};

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  isLight?: boolean;
  accent: string;
  accentText: string;
  accentOn: string;
  rgb: string;
  page: string;
  stage: string;
  surface: string;
  surfaceSoft: string;
  timeline: string;
  textMain: string;
  textMuted: string;
  border: string;
}

export const THEME_PRESETS: Record<ThemeId, ThemeConfig> = {
  'songspot-dark': {
    id: 'songspot-dark',
    name: 'Songspot Default Dark',
    description: 'Original Songspot emerald stage & spotlight theme',
    accent: '#19df70',
    accentText: '#39e887',
    accentOn: '#04160b',
    rgb: '25, 223, 112',
    page: '#030704',
    stage: '#0c110d',
    surface: '#151b16',
    surfaceSoft: '#1f2721',
    timeline: '#232924',
    textMain: '#f4f8f5',
    textMuted: '#9db2a4',
    border: '#29372f',
  },
  'spotify-green': {
    id: 'spotify-green',
    name: 'Spotify Studio',
    description: 'Deep matte carbon with vibrant #1DB954 studio accents',
    accent: '#1db954',
    accentText: '#1ed760',
    accentOn: '#000000',
    rgb: '29, 185, 84',
    page: '#090909',
    stage: '#121212',
    surface: '#181818',
    surfaceSoft: '#282828',
    timeline: '#2a2a2a',
    textMain: '#ffffff',
    textMuted: '#b3b3b3',
    border: '#2e2e2e',
  },
  'neon-cyber': {
    id: 'neon-cyber',
    name: 'Neon Cyber',
    description: 'Synthwave electric cyan & magenta midnight glow',
    accent: '#00f0ff',
    accentText: '#5cf6ff',
    accentOn: '#021318',
    rgb: '0, 240, 255',
    page: '#05040d',
    stage: '#0c091e',
    surface: '#14102c',
    surfaceSoft: '#1e1842',
    timeline: '#251e4b',
    textMain: '#f0f6ff',
    textMuted: '#9896c4',
    border: '#2f275c',
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Vinyl',
    description: 'Warm analog amber, coral orange & vintage vinyl tones',
    accent: '#ff7517',
    accentText: '#ff964f',
    accentOn: '#190900',
    rgb: '255, 117, 23',
    page: '#080503',
    stage: '#171009',
    surface: '#1d150f',
    surfaceSoft: '#2a1e15',
    timeline: '#302820',
    textMain: '#fff7f0',
    textMuted: '#bfa592',
    border: '#3d2c20',
  },
};

export interface GameConfig {
  category: CategoryType;
  difficulty: DifficultyLevel;
  mode: GameMode;
  artistName?: string;
  yearFilter?: string; // e.g., 'any' | '2026' | '2025' | ... | '2020s' | '2010s' | '2000s'
  genreFilter?: string; // e.g., 'any' | 'Pop' | 'T-Pop' | 'Rock' | 'Indie' | 'R&B' | 'Hip-Hop/Rap' | 'K-Pop' | 'EDM' | 'Soundtrack'
  timeRangePreset?: TimeRangePresetId;
  customStages?: number[];
}

export interface GuessHistoryItem {
  trackId?: string;
  title: string;
  artistName?: string;
  stageIndex: number;
  clipSeconds: number;
  status: 'wrong' | 'skipped' | 'correct';
}

export interface MultipleChoiceOption {
  id: string;
  title: string;
  artistName: string;
  artworkUrl?: string;
}

export interface RoundStartResponse {
  roundToken: string;
  roundKey: string;
  audioUrl: string;
  difficulty: DifficultyLevel;
  stages: number[];
  stage: number;
  clipSeconds: number;
  category: CategoryType;
  mode: GameMode;
  artistFilter?: string;
  yearFilter?: string;
  genreFilter?: string;
  choices?: MultipleChoiceOption[]; // 4 multiple-choice answers for Song Guesser mode
  poolSize: number;
  expiresAt: number;
}

export interface RoundActionResponse {
  outcome: 'active' | 'correct' | 'failed';
  roundToken?: string;
  stage: number;
  clipSeconds: number;
  mistakes: number;
  reveal?: Song;
}

export const GENRE_OPTIONS = [
  'any',
  'Pop',
  'T-Pop',
  'Rock',
  'Indie',
  'R&B',
  'Hip-Hop/Rap',
  'K-Pop',
  'EDM',
  'Soundtrack',
] as const;

export const DECADE_OPTIONS = ['2020s', '2010s', '2000s', '1990s', '1980s', 'classic'] as const;

export const YEAR_OPTIONS = Array.from({ length: 27 }, (_, i) => String(2026 - i)); // '2026' down to '2000'

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
  streak: number;
  fastestSeconds: number;
  difficulty: DifficultyLevel;
  category: CategoryType;
  isDaily?: boolean;
  dateKey?: string;
  createdAt: string;
}

export interface DailyChallengeInfo {
  dateKey: string; // YYYY-MM-DD
  category: CategoryType;
  totalRounds: number;
  rounds: RoundStartResponse[];
}

