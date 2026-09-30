/**
 * Opens the game with `?bot` in Chromium and hands back typed calls into `window.__bot`
 * (src/bot/hook.ts). Starts its own Vite dev server on a free port, so nothing else needs to run.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';
import type { BotAction } from '../../src/bot/actions';
import type { BotApi, BotNote, StepReport } from '../../src/bot/hook';
import type { BotState } from '../../src/bot/state';

export interface GameSession {
  page: Page;
  start(level: number, seed?: number): Promise<BotState>;
  act(action: BotAction, frames: number): Promise<StepReport>;
  show(note?: BotNote): Promise<void>;
  close(): Promise<void>;
}

/** BOT_CHROMIUM, then Playwright's own download, then any Chromium already in Playwright's cache. */
function findChromium(): string {
  const fromEnv = process.env.BOT_CHROMIUM;
  if (fromEnv) return fromEnv;
  const bundled = chromium.executablePath();
  if (existsSync(bundled)) return bundled;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const build of readdirSync(join(cache, dir))) {
        const mac = join(cache, dir, build, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
        const linux = join(cache, dir, build, 'chrome');
        if (existsSync(mac)) return mac;
        if (existsSync(linux)) return linux;
      }
    }
  }
  throw new Error('No Chromium found. Run `npx playwright-core install chromium` or set BOT_CHROMIUM.');
}

export async function openGame(options: { headed?: boolean } = {}): Promise<GameSession> {
  // No hot reload or file watching: a reload mid-run would wipe the bot's game.
  const server = await createServer({
    logLevel: 'error',
    server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Vite did not report a local URL');

  const browser = await chromium.launch({
    executablePath: findChromium(),
    headless: !options.headed,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (err) => console.error('[page]', err.message));
  await page.goto(`${url}?bot`);
  await page.waitForFunction(() => '__bot' in window, null, { timeout: 30_000 });

  type Bot = { __bot: BotApi };
  return {
    page,
    start: (level, seed) => page.evaluate(([l, s]) => (window as unknown as Bot).__bot.start(l, s), [level, seed] as const),
    act: (action, frames) => page.evaluate(([a, f]) => (window as unknown as Bot).__bot.act(a, f), [action, frames] as const),
    show: (note) => page.evaluate((n) => (window as unknown as Bot).__bot.show(n), note),
    async close() {
      await browser.close();
      await server.close();
    },
  };
}
