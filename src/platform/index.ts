import { createSteamPlatform } from './steam';
import type { Platform } from './types';
import { webPlatform } from './web';

export type { Platform } from './types';

/** `vite build --mode steam` makes the desktop bundle; the web bundle tree-shakes the Steam code out. */
export const platform: Platform =
  import.meta.env.MODE === 'steam' && window.popscotch ? createSteamPlatform(window.popscotch) : webPlatform;
