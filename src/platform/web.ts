import type { Platform } from './types';

export const webPlatform: Platform = {
  kind: 'web',
  prefersGamepad: false,
  quit: null,
  init: async () => {},
  onGameEvent: () => {},
  onInterrupt: () => {},
};
