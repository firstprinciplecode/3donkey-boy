/**
 * Headless check that each level's intended route can be completed with the real player physics
 * and obstacles (no barrels/ghosts). Run: node --import tsx scripts/sim-routes.ts
 */
const noop: ProxyHandler<object> = { get: (_t, key) => (key === 'measureText' ? () => ({ width: 0 }) : () => undefined) };
(globalThis as { document?: unknown }).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, noop) }),
};

const { LEVELS } = await import('../src/levels/defs');
const { Level } = await import('../src/level');
const { Obstacles } = await import('../src/obstacles');
const { Player } = await import('../src/entities/player');

type Step = { go: 1 | -1; to: [number, number] } | { climb: true };
const go = (dir: 1 | -1, side: number, offset: number): Step => ({ go: dir, to: [side, offset] });
const climb: Step = { climb: true };

const ROUTES: Record<string, Step[]> = {
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

const DT = 1 / 120;
let failures = 0;

for (const def of LEVELS) {
  const level = new Level(def);
  const obs = new Obstacles(level);
  const p = new Player(level);
  p.reset(def.playerStart);
  const keys = def.items.filter((it) => it.type === 'key').map((it) => it.spot);
  const relics = new Set(def.items.filter((it) => it.type === 'relic').map((it) => it.spot));
  const steps = ROUTES[def.name];
  const vines = (def.vines ?? []).map((v) => ({
    ring: v.ring,
    s: level.spotS(v),
    pit: level.span(def.pits.find((pit) => pit.ring === v.ring && pit.side === v.side && pit.offset === v.offset)!),
  }));
  let i = 0;
  let t = 0;
  let outcome = 'timeout';
  let prevS = p.s;
  let swung = 0;

  while (t < 240) {
    t += DT;
    const step = steps[i];
    if (!step) {
      outcome = 'route ended below the summit';
      break;
    }
    const c = { left: false, right: false, up: false, down: false, jump: false };
    if ('climb' in step) {
      c.up = true;
    } else {
      const target = level.sOf(p.ring, step.to[0], step.to[1]);
      if (p.grounded && level.ringDistance(p.ring, p.s, target) < 0.2) {
        i++;
        continue;
      }
      const dir = step.go;
      let firstGap = Infinity;
      let gapEnd = Infinity;
      for (let d = 0.1; d <= 5; d += 0.1) {
        const open = obs.carry(p.ring, p.s + dir * d) === null;
        if (open && firstGap === Infinity) firstGap = d;
        if (!open && firstGap !== Infinity) {
          gapEnd = d;
          break;
        }
      }
      const move = () => (dir > 0 ? (c.right = true) : (c.left = true));
      const platformGap = def.platforms.some((pl) => level.inSpan(level.span(pl), p.ring, p.s + dir * (firstGap + 0.3)));
      const vine = vines.find((v) => level.inSpan(v.pit, p.ring, p.s + dir * (firstGap + 0.3)));
      if (p.state === 'swing') {
        // Let go on the forward swing, just past straight down.
        const v = vines.find((v) => v.ring === p.ring && level.ringDistance(p.ring, p.s, v.s) < 3)!;
        if (dir * level.ringDelta(p.ring, p.s, v.s) > 0.2 && dir * level.ringDelta(p.ring, p.s, prevS) > 0) c.jump = true;
      } else if (vine && p.grounded && firstGap < 0.6) {
        // Wait at the lip for the rope to swing close, then run and jump into it.
        const tip = obs.vineTip(vines.indexOf(vine));
        if (dir * level.ringDelta(p.ring, tip.s, vine.s) < -1.6) {
          move();
          c.jump = true;
        }
      } else if (firstGap > 0.9 || (vine && p.grounded)) move();
      else if (!platformGap && gapEnd - firstGap < 3.2) {
        move();
        if (firstGap < 0.5) c.jump = true;
      }
      // else: wide gap, wait for the platform to bridge it
    }

    const before = p.ring;
    if (process.env.TRACE === def.name && Math.round(t * 120) % 6 === 0) {
      const { side, offset } = level.ringSide(p.ring, p.s);
      console.log(
        `t=${t.toFixed(2)} step=${i} ring=${p.ring} side=${side} off=${offset.toFixed(2)} ${p.state} y=${p.y.toFixed(2)} carry=${obs.carry(p.ring, p.s)} keys=${JSON.stringify(c)}`,
      );
    }
    prevS = p.s;
    const r = p.step(DT, c, obs);
    if (r.grabbed) swung++;
    obs.update(DT, { ring: p.ring, s: p.s, grounded: p.grounded });
    for (const k of keys) {
      if (k.ring === p.ring && level.ringDistance(p.ring, p.s, level.spotS(k)) < 0.5) obs.unlockKeyDoors();
    }
    for (const r of relics) {
      if (r.ring === p.ring && level.ringDistance(p.ring, p.s, level.spotS(r)) < 0.5) relics.delete(r);
    }
    if (def.items.some((it) => it.type === 'relic') && relics.size === 0) obs.unlockRelicDoors();
    if (r.fellInPit) {
      outcome = `fell in a pit on ring ${p.ring} at step ${i}`;
      break;
    }
    if (r.blockedLadder >= 0) {
      outcome = `ladder ${r.blockedLadder} still locked at step ${i}`;
      break;
    }
    if (r.reachedSummit) {
      outcome = 'summit';
      break;
    }
    if ('climb' in step && p.ring > before && p.grounded) i++;
  }

  const ok = outcome === 'summit' && swung >= vines.length;
  if (!ok) failures++;
  const swings = vines.length ? `, swung on ${swung} vine${swung === 1 ? '' : 's'}` : '';
  console.log(`${ok ? '✓' : '✗'} ${def.name}: ${outcome} after ${t.toFixed(1)}s${swings}`);
}
process.exit(failures ? 1 : 0);
