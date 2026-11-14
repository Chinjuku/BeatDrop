import { Redis } from '@upstash/redis';

// Upstash created directly uses UPSTASH_REDIS_REST_*; the Vercel Marketplace integration
// injects the same values as KV_REST_API_*. Accept either so both setups work.
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const isRedisConfigured = Boolean(url && token);

export const redis = isRedisConfigured
  ? new Redis({ url: url!, token: token! })
  : null;
