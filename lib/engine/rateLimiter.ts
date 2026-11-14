import { Ratelimit } from '@upstash/ratelimit';
import { redis, isRedisConfigured } from '../redis';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  prefix?: string;
}

// Cleanup expired entries periodically to prevent memory leaks in local maps
const localStores = new Map<string, Map<string, RateLimitRecord>>();
const upstashLimiters = new Map<string, Ratelimit>();

export async function verifyRateLimit(
  identifier: string,
  options: RateLimiterOptions
): Promise<{ success: boolean; limit: number; remaining: number; resetAt: number }> {
  const { windowMs, maxRequests, prefix = 'rl' } = options;

  // 1. Distributed rate limiting via Upstash Redis (Serverless / Multi-Instance)
  if (isRedisConfigured && redis) {
    let limiter = upstashLimiters.get(prefix);
    if (!limiter) {
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(maxRequests, `${Math.max(1, Math.ceil(windowMs / 1000))} s`),
        prefix: `beatdrop:${prefix}`,
        analytics: false,
      });
      upstashLimiters.set(prefix, limiter);
    }

    try {
      const result = await limiter.limit(identifier);
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        resetAt: result.reset,
      };
    } catch (err) {
      console.warn(`[RateLimiter] Upstash error, fallback to in-memory:`, (err as Error).message);
    }
  }

  // 2. Local In-Memory Fallback (Fast 0ms single-node / offline dev)
  let localStore = localStores.get(prefix);
  if (!localStore) {
    localStore = new Map<string, RateLimitRecord>();
    localStores.set(prefix, localStore);

    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of localStore!.entries()) {
        if (now > record.resetAt) {
          localStore!.delete(key);
        }
      }
    }, Math.max(windowMs, 30_000)).unref();
  }

  const key = `${prefix}:${identifier}`;
  const now = Date.now();

  let record = localStore.get(key);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + windowMs };
    localStore.set(key, record);
  }

  record.count += 1;
  const remaining = Math.max(0, maxRequests - record.count);
  const success = record.count <= maxRequests;

  return {
    success,
    limit: maxRequests,
    remaining,
    resetAt: record.resetAt,
  };
}

export async function checkArtistSyncLimit(identifier: string) {
  return verifyRateLimit(identifier, {
    windowMs: 60 * 1000,
    maxRequests: 5,
    prefix: 'sync',
  });
}

// Per-route limits (general, round, discovery) live in lib/http/api.ts.
