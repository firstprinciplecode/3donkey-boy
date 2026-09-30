/** The intended route for each level, shared with scripts/sim-routes.ts. */
export type RouteStep = { go: 1 | -1; to: [side: number, offset: number] } | { climb: true };

const go = (dir: 1 | -1, side: number, offset: number): RouteStep => ({ go: dir, to: [side, offset] });
const climb: RouteStep = { climb: true };

export const ROUTES: Record<string, readonly RouteStep[]> = {
  meadow: [go(1, 1, 3), climb, go(1, 2, -2), climb, go(-1, 1, 3), go(1, 3, 0), climb, go(1, 0, 0), climb],
  'candy hills': [
    go(-1, 3, 4), climb, go(-1, 2, 5), climb, go(-1, 1, 0), climb,
    go(1, 2, -3), go(-1, 0, 2), climb, go(-1, 3, 0), climb,
  ],
  'desert arcade': [
    go(1, 1, -12), climb, go(-1, 0, 6), climb, go(-1, 0, -6), go(1, 1, -2), climb,
    go(-1, 0, 3), climb, go(-1, 3, 0), go(1, 1, 0), climb, go(-1, 0, 0), climb,
  ],
  'harvest woods': [go(1, 1, -4), climb, go(1, 2, 3), climb, go(1, 3, 2), climb, go(1, 0, -2), climb, go(-1, 3, 0), climb],
  'frost peak': [go(-1, 3, 6), climb, go(1, 0, -4), climb, go(-1, 3, 3), climb, go(1, 0, 2), climb, go(-1, 3, 0), climb],
  'serpent tomb': [
    go(-1, 3, 8), climb, go(-1, 2, 5), climb, go(-1, 1, 2), climb,
    go(-1, 0, 3), climb, go(-1, 3, 0), climb, go(-1, 2, 0), climb,
  ],
  'volcano isle': [
    go(1, 1, -8), climb, go(-1, 0, 6), climb, go(1, 1, 0), climb,
    go(-1, 0, -3), climb, go(1, 1, -2), climb, go(-1, 0, 0), climb,
  ],
};
