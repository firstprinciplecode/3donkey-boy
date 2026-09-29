import { COLORS } from '../config';
import type { SkinName } from '../levels/types';

/** Where a piece hangs: legs stay put, the body bobs, and each arm swings from its shoulder. */
export type BossGroup = 'root' | 'body' | 'armL' | 'armR';

/**
 * One boss piece. Boxes are centred on `p` with size `s`. Cones stand on `p` (their base) with
 * `s = [radius, height, 0]`. `glow` pieces are unlit, so they read as glowing.
 */
export interface BossPart {
  g: BossGroup;
  cone?: boolean;
  s: readonly [number, number, number];
  p: readonly [number, number, number];
  c: number;
  glow?: boolean;
}

interface Palette {
  fur: number;
  legs?: number;
  arms?: number;
  hands: number;
  horns?: number;
  accent?: number;
  eye: number;
  eyeGlow?: boolean;
  /** Omitted for bosses whose eyes are solid holes of light. */
  pupil?: number;
  mouth: number;
  mouthGlow?: boolean;
  teeth: number;
}

const box = (g: BossGroup, s: BossPart['s'], p: BossPart['p'], c: number, glow = false): BossPart => ({ g, s, p, c, glow });
const cone = (g: BossGroup, radius: number, height: number, p: BossPart['p'], c: number, glow = false): BossPart => ({
  g,
  cone: true,
  s: [radius, height, 0],
  p,
  c,
  glow,
});

/** The shared monster: stubby legs, a big block body with a toothy face, and two swinging arms. */
function skeleton(k: Palette): BossPart[] {
  const parts: BossPart[] = [
    box('root', [0.7, 1, 0.8], [-0.65, 0.5, 0], k.legs ?? k.fur),
    box('root', [0.7, 1, 0.8], [0.65, 0.5, 0], k.legs ?? k.fur),
    box('body', [2.4, 2, 1.8], [0, 1, 0], k.fur),
    box('body', [0.45, 0.45, 0.1], [-0.55, 1.45, 0.91], k.eye, k.eyeGlow),
    box('body', [0.45, 0.45, 0.1], [0.55, 1.45, 0.91], k.eye, k.eyeGlow),
    box('body', [1.6, 0.6, 0.1], [0, 0.6, 0.91], k.mouth, k.mouthGlow),
  ];
  if (k.horns !== undefined) {
    parts.push(cone('body', 0.35, 1.1, [-0.7, 2, 0], k.horns), cone('body', 0.35, 1.1, [0.7, 2, 0], k.horns));
  }
  if (k.accent !== undefined) parts.push(box('body', [0.5, 0.3, 0.5], [0, 2.15, 0.3], k.accent));
  if (k.pupil !== undefined) {
    parts.push(
      box('body', [0.16, 0.16, 0.05], [-0.5, 1.4, 0.97], k.pupil),
      box('body', [0.16, 0.16, 0.05], [0.6, 1.4, 0.97], k.pupil),
    );
  }
  for (let i = 0; i < 6; i++) {
    const x = -0.6 + i * 0.24;
    parts.push(box('body', [0.14, 0.22, 0.06], [x, 0.78, 0.97], k.teeth));
    parts.push(box('body', [0.14, 0.18, 0.06], [x + 0.12, 0.42, 0.97], k.teeth));
  }
  for (const arm of ['armL', 'armR'] as const) {
    parts.push(box(arm, [0.55, 1.4, 0.7], [0, -0.65, 0], k.arms ?? k.fur), box(arm, [0.68, 0.5, 0.8], [0, -1.45, 0], k.hands));
  }
  return parts;
}

/** Both arms get the same piece, in each arm's own frame. */
const onArms = (s: BossPart['s'], p: BossPart['p'], c: number, glow = false): BossPart[] => [
  box('armL', s, p, c, glow),
  box('armR', s, p, c, glow),
];

/** Mirrors a body piece across the middle, for pairs like brows and lappets. */
const pair = (s: BossPart['s'], [x, y, z]: BossPart['p'], c: number, glow = false): BossPart[] => [
  box('body', s, [-x, y, z], c, glow),
  box('body', s, [x, y, z], c, glow),
];

/** The poster's black spiky monster. */
const MEADOW = skeleton({
  fur: COLORS.black,
  hands: COLORS.charcoal,
  horns: COLORS.cream,
  accent: COLORS.pink,
  eye: COLORS.pink,
  pupil: COLORS.black,
  mouth: COLORS.charcoal,
  teeth: COLORS.cream,
});

/** A gummy monster with candy-cane horns, a cherry on top and sprinkles. */
const CANDY = [
  ...skeleton({
    fur: COLORS.pink,
    hands: COLORS.magenta,
    horns: COLORS.cream,
    eye: COLORS.cream,
    pupil: COLORS.black,
    mouth: COLORS.violet,
    teeth: COLORS.cream,
  }),
  ...pair([0.62, 0.14, 0.62], [0.7, 2.3, 0], COLORS.red),
  ...pair([0.36, 0.12, 0.36], [0.7, 2.72, 0], COLORS.red),
  box('body', [0.45, 0.45, 0.45], [0, 2.22, 0.2], COLORS.red),
  box('body', [0.08, 0.35, 0.08], [0.05, 2.6, 0.2], COLORS.leafDark),
  ...[
    [-0.95, 1.85, COLORS.yellow],
    [0.95, 1.8, COLORS.cyan],
    [-0.95, 0.3, COLORS.cream],
    [0.95, 0.35, COLORS.yellow],
    [-0.15, 1.92, COLORS.cyan],
    [0.25, 1.95, COLORS.cream],
  ].map(([x, y, c]) => box('body', [0.2, 0.08, 0.04], [x, y, 0.91], c)),
];

/** A sandstone sphinx in a gold and teal headdress. */
const DESERT = [
  ...skeleton({
    fur: COLORS.sandstone,
    hands: COLORS.sandstoneDark,
    eye: COLORS.teal,
    pupil: COLORS.black,
    mouth: COLORS.brown,
    teeth: COLORS.cream,
  }),
  box('body', [2.6, 0.45, 2.0], [0, 2.2, 0], COLORS.gold),
  box('body', [2.62, 0.1, 2.02], [0, 2.08, 0], COLORS.teal),
  box('body', [2.62, 0.1, 2.02], [0, 2.32, 0], COLORS.teal),
  ...pair([0.35, 1.3, 0.5], [1.35, 1.3, 0.55], COLORS.gold),
  ...pair([0.37, 0.1, 0.52], [1.35, 1.05, 0.55], COLORS.teal),
  ...pair([0.37, 0.1, 0.52], [1.35, 1.5, 0.55], COLORS.teal),
  box('body', [0.2, 0.45, 0.15], [0, 2.55, 0.95], COLORS.teal),
];

/** A pumpkin brute: orange ribs, a stem, and a carved face lit from inside. */
const AUTUMN = [
  ...skeleton({
    fur: COLORS.orange,
    legs: COLORS.brown,
    arms: COLORS.brown,
    hands: COLORS.leafDark,
    eye: COLORS.yellow,
    eyeGlow: true,
    mouth: COLORS.yellow,
    mouthGlow: true,
    teeth: COLORS.orange,
  }),
  ...[-0.95, -0.3, 0.3, 0.95].map((x) => box('body', [0.1, 2.0, 0.04], [x, 1, 0.905], COLORS.maple)),
  box('body', [0.3, 0.55, 0.3], [0, 2.27, 0], COLORS.leafDark),
  box('body', [0.6, 0.1, 0.35], [0.4, 2.35, 0.1], COLORS.leaf),
];

/** A snow yeti: white fur, an icy face, ice horns and frosty brows. */
const WINTER = [
  ...skeleton({
    fur: COLORS.snow,
    hands: COLORS.snowShade,
    horns: COLORS.iceDark,
    eye: COLORS.blue,
    pupil: COLORS.black,
    mouth: COLORS.charcoal,
    teeth: COLORS.snow,
  }),
  box('body', [1.95, 1.7, 0.06], [0, 1.05, 0.9], COLORS.ice),
  box('body', [0.9, 0.3, 1.0], [0, 2.1, 0], COLORS.snowShade),
  ...pair([0.55, 0.12, 0.12], [0.55, 1.78, 0.93], COLORS.snowShade),
  ...onArms([0.75, 0.35, 0.85], [0, -0.05, 0], COLORS.snowShade),
];

/** A bandaged mummy with a gold headband, a scarab and eyes that glow green. */
const TOMB = [
  ...skeleton({
    fur: COLORS.cream,
    hands: COLORS.creamDark,
    eye: COLORS.lime,
    eyeGlow: true,
    mouth: COLORS.charcoal,
    teeth: COLORS.creamDark,
  }),
  ...[0.25, 1.05].map((y) => box('body', [2.44, 0.12, 1.84], [0, y, 0], COLORS.creamDark)),
  box('body', [2.46, 0.2, 1.86], [0, 1.9, 0], COLORS.gold),
  box('body', [0.3, 0.3, 0.1], [0, 1.9, 0.93], COLORS.teal),
  ...onArms([0.57, 0.1, 0.72], [0, -0.4, 0], COLORS.creamDark),
  ...onArms([0.57, 0.1, 0.72], [0, -1.0, 0], COLORS.creamDark),
];

/** A lava golem: dark basalt split by glowing cracks, under a crown of flame. */
const VOLCANO = [
  ...skeleton({
    fur: COLORS.basalt,
    hands: COLORS.basaltDark,
    horns: COLORS.basaltDark,
    eye: COLORS.yellow,
    eyeGlow: true,
    mouth: COLORS.lava,
    mouthGlow: true,
    teeth: COLORS.basaltDark,
  }),
  ...pair([0.16, 0.2, 0.16], [0.7, 3.05, 0], COLORS.yellow, true),
  box('body', [0.1, 0.55, 0.04], [-1.0, 0.95, 0.905], COLORS.lava, true),
  box('body', [0.35, 0.1, 0.04], [-0.87, 1.2, 0.905], COLORS.lava, true),
  box('body', [0.1, 0.5, 0.04], [0.98, 1.75, 0.905], COLORS.lava, true),
  box('body', [0.3, 0.1, 0.04], [0.85, 1.52, 0.905], COLORS.lava, true),
  ...onArms([0.57, 0.1, 0.72], [0, -0.9, 0], COLORS.lava, true),
  cone('body', 0.22, 0.7, [-0.35, 2, 0.3], COLORS.orange, true),
  cone('body', 0.26, 0.95, [0, 2, 0.35], COLORS.lava, true),
  cone('body', 0.22, 0.7, [0.35, 2, 0.3], COLORS.orange, true),
];

export const BOSS_LOOKS: Record<SkinName, readonly BossPart[]> = {
  meadow: MEADOW,
  candy: CANDY,
  desert: DESERT,
  autumn: AUTUMN,
  winter: WINTER,
  tomb: TOMB,
  volcano: VOLCANO,
};
