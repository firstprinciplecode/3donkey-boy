import { app } from 'electron';

/** Valve's public test app (Spacewar). Swap in Popscotch's own app id once Steamworks issues it. */
export const STEAM_APP_ID = 480;

/** The shared top-10 lives on the web build's server; the desktop build reads and writes the same table. */
export const SCORE_SERVER = 'https://popscotch.fun';

/** The game page is served from this origin, so localStorage and fetch('/api/scores') behave as on the web. */
export const APP_SCHEME = 'app';
export const APP_HOST = 'popscotch';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** Unpackaged runs only: a Vite dev server (e.g. http://localhost:5173) to load with hot reload. */
export const DEV_URL = app.isPackaged ? null : (process.env.POPSCOTCH_DEV_URL ?? null);

/** Stats the game may write. Each needs a matching INT stat on the Steamworks partner site. */
export const STATS = ['best_score', 'rounds_cleared'] as const;
