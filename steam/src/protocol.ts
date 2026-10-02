import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { net, protocol, type Session } from 'electron';
import { APP_HOST, APP_SCHEME, SCORE_SERVER } from './config';

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/**
 * Everything the page needs is bundled; textures and audio are generated at runtime. The only
 * network traffic is the score table, which goes through this process rather than the page.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const SCORE_BODY_LIMIT = 4096;
const SCORE_TIMEOUT_MS = 8000;

/** Must run before `app` is ready. A standard, secure scheme gets its own localStorage and fetch. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
  ]);
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function serveFile(webRoot: string, pathname: string): Promise<Response> {
  const relative = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '') || 'index.html';
  const file = path.join(webRoot, relative);
  if (!file.startsWith(webRoot + path.sep)) return new Response('Not found', { status: 404 });
  try {
    const body = await readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const headers: Record<string, string> = { 'Content-Type': type };
    if (type.startsWith('text/html')) headers['Content-Security-Policy'] = CONTENT_SECURITY_POLICY;
    return new Response(body, { headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

/** Forwards GET/POST /api/scores to the shared server. Offline, the game keeps its local table. */
async function proxyScores(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  let body: string | undefined;
  if (request.method === 'POST') {
    body = await request.text();
    if (body.length > SCORE_BODY_LIMIT) return json(413, { error: 'Too large' });
  }
  try {
    const upstream = await net.fetch(`${SCORE_SERVER}/api/scores`, {
      method: request.method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(SCORE_TIMEOUT_MS),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return json(503, { error: 'Score server unreachable' });
  }
}

export function serveGame(session: Session, webRoot: string): void {
  const root = path.resolve(webRoot);
  session.protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });
    if (url.pathname === '/api/scores') return proxyScores(request);
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    return serveFile(root, url.pathname);
  });
}
