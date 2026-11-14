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
  /** Quick-pick clip lengths in seconds; any value in the snippet bounds is allowed. */
  clipPresets: [0.5, 2, 5, 10, 15],
  /** Answer window per mode, set by the server (never the client). */
  answerSeconds: { answer: 20, buzzer: 30 },
  maxAttempts: 3,
  /** Buzzer mode: time the buzzing player has to answer. */
  buzzAnswerMs: 10_000,
  /** Pause: total pause budget per game, resume countdown, request window, per-player cooldown. */
  pauseMaxMs: 60_000,
  pauseResumeMs: 3_000,
  pauseRequestMs: 10_000,
  pauseCooldownMs: 30_000,
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
  answerSeconds: ROOM_LIMITS.answerSeconds.answer,
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
  /** Index in join order; stable while scores reorder the list. Feeds `playerColor`. */
  colorIndex: number;
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
  /** Who has answered correctly this round (guessing/reveal), by time. Never carries the song. */
  correct: { playerId: string; name: string; points: number; at: number }[];
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
  /** True when the game ended because only one player was left. */
  endedEarly?: boolean;
  /** True inside any freeze (pause or buzz hold): audio stops. Input locking uses the pause, not this. */
  frozen?: boolean;
  /**
   * Where the clip plays: start `fromSeconds` into the clip at server time `at`. Moves after
   * each freeze so audio resumes where it stopped. Absent while frozen or once the clip is over.
   */
  audioCue?: { at: number; fromSeconds: number };
  /** Present while a host pause is active; `resumingAt` is when its resuming countdown starts. */
  pause?: { byName: string; until: number; resumingAt: number };
  /** Host only: a pending request from a player. */
  pauseRequest?: { playerName: string; expiresAt: number };
  /** Requester only: the state of their request, shown for 5 s after the outcome. */
  myPauseRequest?: 'pending' | 'approved' | 'declined' | 'expired';
}
