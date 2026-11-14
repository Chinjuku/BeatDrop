/**
 * Live rooms: types shared by the server (lib/rooms) and the client (room pages).
 * The server keeps a RoomState; clients only ever receive a RoomView built for them.
 */
import type { CategoryType, DifficultyLevel } from './types';

/**
 * How a song is won. 'answer' = everyone guesses, faster scores more.
 * 'buzzer' = first to buzz gets to answer; a wrong answer locks that player out for the song.
 */
export type RoomMode = 'answer' | 'buzzer';

/** 'host' = friends together, only the host device plays; 'everyone' = apart, every device plays. */
export type RoomAudio = 'host' | 'everyone';

export interface RoomSettings {
  mode: RoomMode;
  audio: RoomAudio;
  category: CategoryType;
  difficulty: DifficultyLevel;
  artistName?: string;
  rounds: number;
  clipSeconds: number;
  answerSeconds: number;
}

export const ROOM_LIMITS = {
  maxPlayers: 12,
  rounds: [5, 10, 15],
  clipSeconds: [2, 5, 10],
  answerSeconds: 20,
  maxAttempts: 3,
  /** Buzzer mode: time the buzzing player has to answer. */
  buzzAnswerMs: 8000,
  countdownMs: 3000,
  revealMs: 6000,
  nameMaxLength: 20,
  codeLength: 5,
  ttlSeconds: 2 * 60 * 60,
} as const;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  mode: 'answer',
  audio: 'everyone',
  category: 'all',
  difficulty: 'easy',
  rounds: 10,
  clipSeconds: 5,
  answerSeconds: ROOM_LIMITS.answerSeconds,
};

export type RoomPhase = 'lobby' | 'countdown' | 'guessing' | 'reveal' | 'finished';

export interface RoomRevealSong {
  id: string;
  title: string;
  artistName: string;
  artworkUrl?: string;
}

export interface RoomPlayerView {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  isMe: boolean;
  left: boolean;
  /** This round: has the player finished (correct or out of attempts)? */
  done: boolean;
  /** Points earned this round (only shown in reveal / finished). */
  roundPoints?: number;
  roundCorrect?: boolean;
}

export interface RoomView {
  code: string;
  version: number;
  settings: RoomSettings;
  phase: RoomPhase;
  /** 0-based index of the current (or just revealed) round. */
  roundIndex: number;
  totalRounds: number;
  /** Server clock at the moment the view was built (ms since epoch). */
  serverNow: number;
  playAt?: number;
  endsAt?: number;
  revealEndsAt?: number;
  audioUrl?: string;
  players: RoomPlayerView[];
  me: {
    id: string;
    isHost: boolean;
    attempts: number;
    correct: boolean;
    points: number;
  };
  reveal?: RoomRevealSong;
  /** Buzzer mode only, while guessing. */
  buzz?: {
    holderId?: string;
    holderName?: string;
    /** Server time the holder must answer by. */
    deadline?: number;
    lockedOut: boolean;
    canBuzz: boolean;
  };
}
