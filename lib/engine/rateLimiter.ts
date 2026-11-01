import { Request, Response, NextFunction } from 'express';
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

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
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

export function createRateLimiter(options: RateLimiterOptions) {
  const { maxRequests, message = 'Too many requests. Please slow down.' } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Admin bypass: requests with a valid x-admin-key bypass public rate limits
    const configuredAdminKey = process.env.ADMIN_API_KEY;
    if (configuredAdminKey) {
      const providedKey = req.headers['x-admin-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
      if (providedKey === configuredAdminKey) {
        return next();
      }
    }

    const ip = getClientIp(req);
    const result = await verifyRateLimit(ip, options);

    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.success) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        code: 429,
        message,
        retryAfter,
      });
      return;
    }

    next();
  };
}

// 1. General API: 60 req/min per IP
export const generalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  prefix: 'gen',
  message: 'API rate limit exceeded. Please wait a moment.',
});

// 2. Round generation & songs: 40 req/min per IP
export const roundLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 40,
  prefix: 'round',
  message: 'คุณเริ่มรอบเพลงถี่เกินไป กรุณารอสักครู่ (Round rate limit exceeded)',
});

// 3. Live iTunes discovery: 15 req/min per IP
export const artistDiscoverLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
  prefix: 'discover',
  message: 'ค้นหาศิลปินออนไลน์ถี่เกินไป กรุณารอ 1 นาที (iTunes discovery rate limit)',
});

// 4. Batch sync from iTunes: 5 req/min per IP
export const artistSyncLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  prefix: 'sync',
  message: 'จำกัดการดึงเพลงเข้าคลังไม่เกิน 5 ครั้งต่อนาที เพื่อป้องกันการโดน Apple แบน',
});
