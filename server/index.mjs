import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { handleScoreRequest } from './scores.mjs';

const root = path.resolve(process.env.STATIC_ROOT || 'public');
const port = Number(process.env.PORT || 3000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function fileFor(pathname) {
  const parts = decodeURIComponent(pathname)
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..');
  const file = path.join(root, ...parts);
  if (existsSync(file) && statSync(file).isFile()) return file;
  if (path.extname(pathname)) return null;
  return path.join(root, 'index.html');
}

createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/api/scores') {
    void handleScoreRequest(req, res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  const file = fileFor(url.pathname);
  if (!file || !existsSync(file)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => {
  console.log(`Popscotch listening on ${port}`);
});
