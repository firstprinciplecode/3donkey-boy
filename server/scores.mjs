import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const SIZE = 10;
const MAX_SCORE = 10_000_000;
const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'scores.db');

let readRows;
let replaceBoard;
try {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 3000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      name TEXT PRIMARY KEY,
      score INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  readRows = db.prepare('SELECT name, score, updated_at FROM scores ORDER BY score DESC, updated_at ASC');
  const clearRows = db.prepare('DELETE FROM scores');
  const insertRow = db.prepare('INSERT INTO scores (name, score, updated_at) VALUES (?, ?, ?)');
  replaceBoard = db.transaction((rows) => {
    clearRows.run();
    for (const row of rows) insertRow.run(row.name, row.score, row.updatedAt);
  });
} catch (err) {
  console.error('Score database unavailable:', err instanceof Error ? err.message : err);
}

function board() {
  if (!readRows) return [];
  return readRows.all().map((row) => ({ name: row.name, score: row.score, updatedAt: row.updated_at }));
}

function publicBoard(rows) {
  return rows.map(({ name, score }) => ({ name, score }));
}

/** Same placement rules as insertScore in src/hiscore.ts. Ties stay under the older score. */
function place(rows, name, score) {
  const existing = rows.findIndex((row) => row.name === name);
  if (existing !== -1 && rows[existing].score >= score) {
    return { rows, index: existing, improved: false };
  }
  const rest = rows.filter((_, i) => i !== existing);
  const index = rest.findIndex((row) => score > row.score);
  const at = index === -1 ? rest.length : index;
  if (index === -1 && rest.length >= SIZE) return { rows, index: null, improved: false };
  rest.splice(at, 0, { name, score, updatedAt: Date.now() });
  return { rows: rest.slice(0, SIZE), index: at, improved: true };
}

export function sanitizeName(raw) {
  const letters = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  return letters.padEnd(3, 'A');
}

export function submitScores(entries) {
  let rows = board();
  let index = null;
  let improved = false;
  for (const entry of entries) {
    const name = sanitizeName(entry?.name);
    const score = Math.floor(Number(entry?.score));
    if (!/^[A-Z]{3}$/.test(name) || !Number.isFinite(score) || score <= 0 || score > MAX_SCORE) continue;
    const placed = place(rows, name, score);
    rows = placed.rows;
    index = placed.index;
    improved = improved || placed.improved;
    if (placed.improved && replaceBoard) replaceBoard(rows);
  }
  return { board: publicBoard(rows), index, improved };
}

const hits = new Map();

function allowed(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= 20) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2048) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'local';
}

/** GET returns the top 10. POST records one score, or up to 10 when migrating a browser's old table. */
export async function handleScoreRequest(req, res) {
  if (!readRows) {
    send(res, 503, { error: 'Score database unavailable' });
    return;
  }
  if (req.method === 'GET') {
    send(res, 200, { board: publicBoard(board()) });
    return;
  }
  if (req.method !== 'POST') {
    send(res, 405, { error: 'POST a score or GET the table' });
    return;
  }
  if (!allowed(clientIp(req))) {
    send(res, 429, { error: 'Slow down' });
    return;
  }
  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || '{}');
  } catch {
    send(res, 400, { error: 'Expected JSON' });
    return;
  }
  const rawEntries = Array.isArray(payload.entries) ? payload.entries.slice(0, SIZE) : [payload];
  const entries = [];
  for (const entry of rawEntries) {
    const score = Math.floor(Number(entry?.score));
    if (!Number.isFinite(score) || score <= 0 || score > MAX_SCORE) continue;
    const name = sanitizeName(entry?.name);
    if (!/^[A-Z]{3}$/.test(name)) continue;
    entries.push({ name, score });
  }
  if (entries.length === 0) {
    send(res, 400, { error: 'Need a three-letter name and a score' });
    return;
  }
  send(res, 200, submitScores(entries));
}
