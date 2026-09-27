export const COLORS = {
  black: 0x1b1b22,
  charcoal: 0x2e2e38,
  grey: 0x45454f,
  grass: 0x9bd23c,
  grassDark: 0x74b52c,
  leaf: 0x5fa02a,
  leafDark: 0x2f6b25,
  stone: 0x8a7d62,
  stoneDark: 0x6a5f49,
  sand: 0xd9c9a0,
  cream: 0xf4f1e6,
  creamDark: 0xdcd6c2,
  pink: 0xff2f7a,
  magenta: 0xd81b60,
  orange: 0xff9a1f,
  yellow: 0xffd23a,
  red: 0xff3b3b,
  cyan: 0x6fe0da,
  teal: 0x2aa6a6,
  blue: 0x2d7fd8,
  purple: 0x8e4fd8,
  brown: 0x7a4a2a,
  tan: 0xe8b26a,
  snow: 0xf7fbff,
  snowShade: 0xdbe8f2,
  ice: 0xbfe9f5,
  iceDark: 0x8fcfe6,
  maple: 0xe8612c,
  rust: 0xb8471f,
  gold: 0xf2b632,
  lava: 0xff5a1f,
  basalt: 0x3a3440,
  basaltDark: 0x2a2530,
  sandstone: 0xe0b878,
  sandstoneDark: 0xc79a5c,
} as const;

export const RAINBOW: readonly number[] = [
  COLORS.red,
  COLORS.orange,
  COLORS.yellow,
  COLORS.grass,
  COLORS.teal,
  COLORS.blue,
  COLORS.purple,
];

export const PHYSICS = {
  gravity: -32,
  moveSpeed: 6.5,
  climbSpeed: 4.2,
  jumpVelocity: 10.5,
  ladderGrab: 0.5,
  substep: 1 / 120,
} as const;

export const PLAYER_SIZE = { halfWidth: 0.32, height: 1.5 } as const;

export const BARREL = {
  radius: 0.42,
  baseSpeed: 5.2,
  ladderChance: 0.3,
  /** Chance a barrel reverses direction each time it lands on a lower ring. */
  flipChance: 0.5,
  minInterval: 1.7,
  maxInterval: 3.4,
  maxAlive: 9,
} as const;

export const GHOST = { speed: 1.8, radius: 0.45 } as const;

export const FIRE = { speed: 2.3, radius: 0.38, ladderChance: 0.4, minTurn: 1.2, maxTurn: 3.5 } as const;

export const HAMMER = { duration: 9, warnAt: 2.5 } as const;

export const OBSTACLES = {
  conveyorSpeed: 2.6,
  /** Seconds a crumbling tile shakes after being stepped on, then how long it takes to fall away. */
  crumbleDelay: 0.6,
  crumbleFall: 0.5,
  /** Forgiveness at pit edges: you only fall once your centre is this far past the lip. */
  pitMargin: 0.2,
  switchReach: 0.6,
  /** Launch speed off a spring pad; clears a 5-wide pit at full run. */
  springVelocity: 17,
  springReach: 0.45,
  /** How quickly your speed catches up with the stick on ice (normal floor is instant). */
  iceGrip: 1.6,
} as const;

export const HAZARDS = {
  /** A jet rumbles for this long before it erupts, then stays up this long. */
  jetWarn: 0.6,
  jetBurst: 1.1,
  jetHeight: 2.6,
  /** Drops let go when you come this close along the ring, after a short shake. */
  dropTrigger: 2.4,
  dropShake: 0.45,
  dropGravity: -26,
  dropRespawn: 3.5,
  dropRadius: 0.35,
} as const;

export const CRAWLER = { speed: 2.1, radius: 0.42, rearEvery: 3.2, rearTime: 1.1 } as const;

export const GAME_RULES = {
  lives: 3,
  maxLives: 6,
  bonusStart: 5000,
  bonusStep: 100,
  bonusInterval: 2,
  maxSpeedMul: 1.8,
} as const;

export const SCORE = {
  jumpBarrel: 100,
  jumpCrawler: 200,
  gem: 50,
  hotdog: 300,
  relic: 500,
  smashBarrel: 300,
  smashFire: 500,
  smashGhost: 500,
  smashCrawler: 500,
} as const;

export const CAMERA = {
  /** Angle from straight down: 90° is a flat Fez-style side view, 60° the isometric look. */
  playPolarDeg: 60,
  showcasePolarDeg: 60,
  /** Constant sideways tilt so faces keep an isometric look instead of reading flat-on. */
  yawBiasDeg: 14,
  /** Duration of the 90° camera turn at a corner; the world freezes while it plays. */
  turnDuration: 0.45,
  /** How far past a corner (world units) the player must walk before the view turns. */
  turnHysteresis: 0.35,
  showcaseTurnEvery: 3,
  /**
   * The play camera sits just outside the pyramid: scenery further out than this is behind the
   * near plane, so it can never block the view of the player while the camera orbits.
   */
  playDistance: 16,
  showcaseDistance: 80,
  showcaseZoom: 0.5,
  minHalfHeight: 8.5,
  minHalfWidth: 11,
} as const;

export const HISCORE_KEY = 'popscotch.hiscore';
