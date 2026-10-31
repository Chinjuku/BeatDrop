/**
 * BeatDrop — lib/expressBridge.ts
 * Bridges Next.js App Router Web Fetch Request (`Request`) to the unified catalog/round logic
 * in `lib/catalogEngine.ts` so all endpoints work seamlessly in Next.js Route Handlers.
 */

import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import app from './catalogEngine';

export async function forwardToExpress(req: Request, overridePath?: string): Promise<Response> {
  const url = new URL(req.url);
  const pathAndQuery = overridePath ? `${overridePath}${url.search}` : `${url.pathname}${url.search}`;

  let parsedBody: unknown = {};
  let bodyBuffer: Buffer | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const text = await req.text();
      bodyBuffer = Buffer.from(text, 'utf-8');
      parsedBody = text ? JSON.parse(text) : {};
    } catch {
      parsedBody = {};
    }
  }

  const headersObj: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headersObj[key.toLowerCase()] = value;
  });

  return new Promise<Response>((resolve) => {
    const stream = bodyBuffer ? Readable.from([bodyBuffer]) : Readable.from([]);
    const mockReq = Object.assign(stream, {
      method: req.method,
      url: pathAndQuery,
      originalUrl: pathAndQuery,
      headers: headersObj,
      body: parsedBody,
      socket: { remoteAddress: '127.0.0.1', destroy: () => {} },
      connection: { remoteAddress: '127.0.0.1', destroy: () => {} },
      get(name: string) {
        return headersObj[name.toLowerCase()];
      },
      header(name: string) {
        return headersObj[name.toLowerCase()];
      },
    });

    const resHeaders = new Headers();
    let statusCode = 200;
    const chunks: Buffer[] = [];
    let isResolved = false;

    const mockRes = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headersSent: false,
      setHeader(name: string, value: string | string[]) {
        resHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
        return this;
      },
      getHeader(name: string) {
        return resHeaders.get(name) ?? undefined;
      },
      removeHeader(name: string) {
        resHeaders.delete(name);
      },
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: unknown) {
        if (!resHeaders.has('content-type')) {
          resHeaders.set('content-type', 'application/json; charset=utf-8');
        }
        this.end(JSON.stringify(data));
        return this;
      },
      send(data: unknown) {
        if (typeof data === 'object' && data !== null && !Buffer.isBuffer(data)) {
          return this.json(data);
        }
        this.end(String(data ?? ''));
        return this;
      },
      write(chunk: string | Buffer) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        return true;
      },
      end(chunk?: string | Buffer) {
        if (chunk !== undefined) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        }
        this.headersSent = true;
        if (!isResolved) {
          isResolved = true;
          const body = Buffer.concat(chunks);
          resolve(
            new Response(body, {
              status: statusCode || this.statusCode || 200,
              headers: resHeaders,
            })
          );
        }
        return this;
      },
    });

    app(mockReq as never, mockRes as never);
  });
}
