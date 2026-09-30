import { writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleScoreRequest } from './server/scores.mjs';
import { SONG_ORDER, songError, type SongTheme } from './src/song-data';
import type { SkinName } from './src/levels/types';

const songsPath = fileURLToPath(new URL('./src/songs.json', import.meta.url));

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function handleSongSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let payload: unknown;
  try {
    payload = JSON.parse((await readBody(req)) || '{}') as unknown;
  } catch {
    sendJson(res, 400, { error: 'Expected JSON' });
    return;
  }
  if (!payload || typeof payload !== 'object') {
    sendJson(res, 400, { error: 'Expected a song book' });
    return;
  }
  const book = payload as Record<SkinName, SongTheme>;
  for (const skin of SONG_ORDER) {
    const song = book[skin];
    if (!song || !Array.isArray(song.bars)) {
      sendJson(res, 400, { error: `${skin} is missing` });
      return;
    }
    const error = songError(song.bars);
    if (error) {
      sendJson(res, 400, { error: `${song.title}: ${error}` });
      return;
    }
  }
  writeFileSync(songsPath, `${JSON.stringify(book, null, 2)}\n`);
  sendJson(res, 200, { ok: true });
}

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: 'popscotch-scores',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = req.url?.split('?')[0];
        if (path === '/api/songs' && req.method === 'PUT') {
          void handleSongSave(req, res).catch(next);
          return;
        }
        if (path !== '/api/scores') return next();
        void handleScoreRequest(req, res).catch(next);
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: page('./index.html'),
        assets: page('./assets.html'),
        music: page('./music.html'),
      },
    },
  },
});
