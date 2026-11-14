/**
 * Minimal request/response contract shared by the engine handlers in `lib/engine/*`.
 *
 * Handlers keep a `(req, res)` shape so they stay easy to call from tests and scripts,
 * but nothing here depends on Express: `runApiHandler` adapts a Web `Request` from a
 * Next Route Handler, applies rate limits, and turns the collected result into a `Response`.
 */
import { ensureCatalogLoaded } from '../engine/songPool';
import { verifyRateLimit, type RateLimiterOptions } from '../engine/rateLimiter';

export type QueryValue = string | string[] | undefined;

export interface ApiRequest {
  method?: string;
  query: Record<string, QueryValue>;
  body?: any;
  params: Record<string, string>;
  headers: Record<string, string | undefined>;
  ip?: string;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: unknown): ApiResponse;
  setHeader(name: string, value: string | string[]): ApiResponse | void;
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => unknown;

export function headerValue(req: Pick<ApiRequest, 'headers'>, name: string): string | undefined {
  const value = req.headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value : undefined;
}

export function getClientIp(req: Pick<ApiRequest, 'headers' | 'ip'>): string {
  const forwarded = headerValue(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headerValue(req, 'x-real-ip') || req.ip || '127.0.0.1';
}

/** The admin key from `x-admin-key` or `Authorization: Bearer`, if any. */
export function providedAdminKey(req: Pick<ApiRequest, 'headers'>): string | undefined {
  return headerValue(req, 'x-admin-key') || headerValue(req, 'authorization')?.replace(/^Bearer\s+/i, '');
}

export function isAdminRequest(req: Pick<ApiRequest, 'headers'>): boolean {
  const configured = process.env.ADMIN_API_KEY;
  return Boolean(configured && providedAdminKey(req) === configured);
}

class CollectedResponse implements ApiResponse {
  statusCode = 200;
  headers = new Headers();
  body: string | null = null;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(data: unknown) {
    if (!this.headers.has('content-type')) {
      this.headers.set('content-type', 'application/json; charset=utf-8');
    }
    this.body = JSON.stringify(data);
    return this;
  }

  setHeader(name: string, value: string | string[]) {
    const values = Array.isArray(value) ? value : [value];
    if (name.toLowerCase() === 'set-cookie') {
      for (const v of values) this.headers.append('set-cookie', String(v));
    } else {
      this.headers.set(name, values.join(', '));
    }
    return this;
  }

  toResponse(): Response {
    return new Response(this.body, { status: this.statusCode, headers: this.headers });
  }
}

async function toApiRequest(req: Request, params: Record<string, string>): Promise<ApiRequest> {
  const url = new URL(req.url);
  const query: Record<string, QueryValue> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    query[key] = all.length > 1 ? all : all[0];
  }

  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  let body: unknown = {};
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
  }

  return { method: req.method, query, body, params, headers };
}

/** Shared per-IP limit for every API call (60 req/min). */
export const GENERAL_LIMIT: RateLimiterOptions = {
  windowMs: 60 * 1000,
  maxRequests: 60,
  prefix: 'gen',
  message: 'API rate limit exceeded. Please wait a moment.',
};

/** Round generation & songs (40 req/min). */
export const ROUND_LIMIT: RateLimiterOptions = {
  windowMs: 60 * 1000,
  maxRequests: 40,
  prefix: 'round',
  message: 'คุณเริ่มรอบเพลงถี่เกินไป กรุณารอสักครู่ (Round rate limit exceeded)',
};

/** Live iTunes discovery (15 req/min). */
export const DISCOVER_LIMIT: RateLimiterOptions = {
  windowMs: 60 * 1000,
  maxRequests: 15,
  prefix: 'discover',
  message: 'ค้นหาศิลปินออนไลน์ถี่เกินไป กรุณารอ 1 นาที (iTunes discovery rate limit)',
};

interface RunOptions {
  /** Extra limiter applied after the general one (e.g. ROUND_LIMIT). */
  limit?: RateLimiterOptions | ((req: ApiRequest) => RateLimiterOptions | undefined);
  /** Reject with 403 unless the request carries the admin key. */
  adminOnly?: boolean;
  params?: Record<string, string>;
}

/** Applies one limiter; returns false (and writes a 429) when the caller is over the limit. */
async function applyLimit(req: ApiRequest, res: CollectedResponse, options: RateLimiterOptions): Promise<boolean> {
  if (isAdminRequest(req)) return true;
  const result = await verifyRateLimit(getClientIp(req), options);
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  if (result.success) return true;

  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({
    code: 429,
    message: options.message ?? 'Too many requests. Please slow down.',
    retryAfter,
  });
  return false;
}

/** Runs an engine handler for a Next Route Handler request. */
export async function runApiHandler(request: Request, handler: ApiHandler, options: RunOptions = {}): Promise<Response> {
  const res = new CollectedResponse();
  try {
    const req = await toApiRequest(request, options.params ?? {});
    ensureCatalogLoaded();

    if (!(await applyLimit(req, res, GENERAL_LIMIT))) return res.toResponse();
    const extra = typeof options.limit === 'function' ? options.limit(req) : options.limit;
    if (extra && !(await applyLimit(req, res, extra))) return res.toResponse();

    if (options.adminOnly && !isAdminRequest(req)) {
      res.status(403).json({
        code: 403,
        message: process.env.ADMIN_API_KEY
          ? 'Forbidden: Valid x-admin-key header is required for administrative operations.'
          : 'Forbidden: ADMIN_API_KEY is not configured on server.',
      });
      return res.toResponse();
    }

    await handler(req, res);
    if (res.body === null && res.statusCode === 200) {
      // Every handler must answer; treat silence as a server bug rather than an empty 200.
      res.status(500).json({ code: -1, message: 'Handler returned no response' });
    }
  } catch (err) {
    console.error('[api] unhandled error:', err);
    res.status(500).json({ code: -1, message: 'Internal server error' });
  }
  return res.toResponse();
}
