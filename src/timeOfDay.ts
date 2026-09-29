export type TimeOfDay = 'day' | 'dusk' | 'night';

export const TIMES: readonly TimeOfDay[] = ['day', 'dusk', 'night'];

export interface Lighting {
  skyColor: number;
  groundColor: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPosition: readonly [number, number, number];
  /** Windows, lanterns and balloons render unlit so they read as glowing. */
  glow: boolean;
}

export const LIGHTING: Record<TimeOfDay | 'bake', Lighting> = {
  day: {
    skyColor: 0xffffff,
    groundColor: 0xa9c79a,
    hemiIntensity: 1.6,
    sunColor: 0xfff4e0,
    sunIntensity: 2.2,
    sunPosition: [-25, 60, 35],
    glow: false,
  },
  dusk: {
    skyColor: 0xffd6b8,
    groundColor: 0x8a6f9e,
    hemiIntensity: 1.25,
    sunColor: 0xff9d5c,
    sunIntensity: 2.0,
    sunPosition: [-50, 28, 30],
    glow: true,
  },
  night: {
    skyColor: 0x8a9ae0,
    groundColor: 0x2c2748,
    hemiIntensity: 1.0,
    sunColor: 0xb8c8ff,
    sunIntensity: 1.0,
    sunPosition: [30, 55, 30],
    glow: true,
  },
  /** High, hard sun for the desert: warm and bright, with sand-coloured bounce instead of green. */
  bake: {
    skyColor: 0xfff8ee,
    groundColor: 0xe8c48a,
    hemiIntensity: 1.15,
    sunColor: 0xfff0c4,
    sunIntensity: 3.2,
    sunPosition: [10, 92, 8],
    glow: false,
  },
};

/**
 * Time of day moves on every round, and shifts by one each lap through the levels, so the
 * same level comes round at a different time of day on each lap. The desert stays in daylight:
 * night belongs to the later levels.
 */
export function timeForRound(round: number, levelCount: number): TimeOfDay {
  const i = round - 1;
  const lap = Math.floor(i / levelCount);
  return TIMES[(i + lap) % TIMES.length];
}

export function timeForLevel(round: number, levelCount: number, skin: string): TimeOfDay {
  if (skin === 'desert') return 'day';
  return timeForRound(round, levelCount);
}

export function lightingFor(time: TimeOfDay, skin: string): Lighting {
  if (skin === 'desert') return LIGHTING.bake;
  return LIGHTING[time];
}
