export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const randRange = (a: number, b: number): number => a + Math.random() * (b - a);

/** Frame-rate independent exponential smoothing. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const TAU = Math.PI * 2;
  const delta = ((((target - current + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

/** Deterministic PRNG (mulberry32) so the decor layout is stable between reloads. */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sphere vs upright cylinder standing at (px, py, pz). */
export function sphereHitsCylinder(
  cx: number,
  cy: number,
  cz: number,
  r: number,
  px: number,
  py: number,
  pz: number,
  radius: number,
  height: number,
): boolean {
  const horizontalGap = Math.max(0, Math.hypot(cx - px, cz - pz) - radius);
  const verticalGap = cy < py ? py - cy : cy > py + height ? cy - (py + height) : 0;
  return horizontalGap ** 2 + verticalGap ** 2 < r * r;
}

/** Level names are stored lowercase. The HUD shows them as titles. */
export function levelTitle(name: string): string {
  return name.replace(/(^|\s)([a-z])/g, (_gap, lead: string, ch: string) => lead + ch.toUpperCase());
}

/** Plain total, grouped by thousands: 1800 -> "1,800". */
export function formatScore(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString('en-US');
}
