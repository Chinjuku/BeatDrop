/**
 * Where live rooms live. Upstash Redis when configured (shared by every serverless instance);
 * an in-process Map for local development and SQLite offline mode. On Vercel without Redis
 * there is no shared store, so rooms are unavailable rather than silently split per instance.
 */
import { redis, isRedisConfigured } from '../redis';
import { ROOM_LIMITS } from '../../shared/roomTypes';
import type { RoomState } from './timeline';

export interface RoomStore {
  get(code: string): Promise<RoomState | null>;
  /** Saves only if no room exists under that code. */
  create(room: RoomState): Promise<boolean>;
  /** Saves only if the stored version still equals `expectedVersion`. */
  replace(room: RoomState, expectedVersion: number): Promise<boolean>;
}

const key = (code: string) => `beatdrop:room:${code}`;

class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, { json: string; expiresAt: number }>();

  private read(code: string): RoomState | null {
    const entry = this.rooms.get(code);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.rooms.delete(code);
      return null;
    }
    return JSON.parse(entry.json) as RoomState;
  }

  private write(room: RoomState) {
    this.rooms.set(room.code, {
      json: JSON.stringify(room),
      expiresAt: Date.now() + ROOM_LIMITS.ttlSeconds * 1000,
    });
  }

  async get(code: string) {
    return this.read(code);
  }

  async create(room: RoomState) {
    if (this.read(room.code)) return false;
    this.write(room);
    return true;
  }

  async replace(room: RoomState, expectedVersion: number) {
    const current = this.read(room.code);
    if (!current || current.version !== expectedVersion) return false;
    this.write(room);
    return true;
  }
}

// Compare-and-set on the stored version, atomically inside Redis.
const REPLACE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
if cjson.decode(current).version ~= tonumber(ARGV[2]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
return 1
`;

class RedisRoomStore implements RoomStore {
  async get(code: string) {
    const value = await redis!.get<RoomState | string>(key(code));
    if (!value) return null;
    return typeof value === 'string' ? (JSON.parse(value) as RoomState) : value;
  }

  async create(room: RoomState) {
    const result = await redis!.set(key(room.code), JSON.stringify(room), { nx: true, ex: ROOM_LIMITS.ttlSeconds });
    return result === 'OK';
  }

  async replace(room: RoomState, expectedVersion: number) {
    const result = await redis!.eval(
      REPLACE_SCRIPT,
      [key(room.code)],
      [JSON.stringify(room), String(expectedVersion), String(ROOM_LIMITS.ttlSeconds)]
    );
    return Number(result) === 1;
  }
}

// Next bundles each Route Handler separately, so a module-level variable would give every
// route its own Map. Hang the in-memory store on globalThis so one Node process shares it.
const globalRooms = globalThis as typeof globalThis & { __beatdropRoomStore?: MemoryRoomStore };

/** The store for this deployment, or null when rooms cannot work here. */
export function getRoomStore(): RoomStore | null {
  if (isRedisConfigured && redis) return new RedisRoomStore();
  if (process.env.VERCEL) return null;
  globalRooms.__beatdropRoomStore ??= new MemoryRoomStore();
  return globalRooms.__beatdropRoomStore;
}

/**
 * Read-modify-write with optimistic locking. `mutate` returns false to abort without saving.
 * Retries when another request changed the room in between (e.g. two players answering).
 */
export async function updateRoom<T>(
  store: RoomStore,
  code: string,
  mutate: (room: RoomState) => T | false
): Promise<{ room: RoomState; result: T } | { room: RoomState | null; result: false }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const room = await store.get(code);
    if (!room) return { room: null, result: false };
    const expected = room.version;
    const result = mutate(room);
    if (result === false) return { room, result: false };
    room.version = expected + 1;
    if (await store.replace(room, expected)) return { room, result };
  }
  throw new Error('Room is busy, please retry');
}
