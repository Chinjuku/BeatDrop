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

export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxRequests, message = 'Too many requests. Please slow down.', prefix = 'rl' } = options;
  const localStore = new Map<string, RateLimitRecord>();

  // In-Memory: cleanup expired entries periodically to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of localStore.entries()) {
      if (now > record.resetAt) {
        localStore.delete(key);
      }
    }
  }, Math.max(windowMs, 30_000)).unref();

  // Distributed: initialize Upstash Ratelimit if credentials exist
  const upstashLimiter = isRedisConfigured && redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(maxRequests, `${Math.max(1, Math.ceil(windowMs / 1000))} s`),
        prefix: `beatdrop:${prefix}`,
        analytics: false,
      })
    : null;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = getClientIp(req);

    // 1. Distributed rate limiting via Upstash Redis (Serverless / Multi-Instance)
    if (upstashLimiter) {
      try {
        const result = await upstashLimiter.limit(ip);
        res.setHeader('X-RateLimit-Limit', String(result.limit));
        res.setHeader('X-RateLimit-Remaining', String(result.remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.reset / 1000)));

        if (!result.success) {
          const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
          res.setHeader('Retry-After', String(retryAfter));
          res.status(429).json({
            code: 429,
            message,
            retryAfter,
          });
          return;
        }
        next();
        return;
      } catch (err) {
        // Fallback to local in-memory on Upstash network failure
        console.warn(`[RateLimiter] Upstash error, fallback to in-memory:`, (err as Error).message);
      }
    }

    // 2. Local In-Memory Fallback (Fast 0ms single-node / offline dev)
    const key = `${prefix}:${ip}`;
    const now = Date.now();

    let record = localStore.get(key);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      localStore.set(key, record);
    }

    record.count += 1;

    const remaining = Math.max(0, maxRequests - record.count);
    const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

    if (record.count > maxRequests) {
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
