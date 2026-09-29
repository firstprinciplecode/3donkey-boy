/**
 * Measures how forgiving each vine is: the share of a swing in which a running jump from the lip
 * catches the rope, and the share in which letting go lands on the far side.
 * Run: node --import tsx scripts/vine-windows.ts
 */
const noop: ProxyHandler<object> = { get: (_t, key) => (key === 'measureText' ? () => ({ width: 0 }) : () => undefined) };
(globalThis as { document?: unknown }).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, noop) }),
};

const { LEVELS } = await import('../src/levels/defs');
const { Level } = await import('../src/level');
const { Obstacles } = await import('../src/obstacles');
const { Player } = await import('../src/entities/player');
const { VINE } = await import('../src/config');

const DT = 1 / 120;
const idle = { left: false, right: false, up: false, down: false, jump: false };

for (const def of LEVELS) {
  for (const v of def.vines ?? []) {
    const level = new Level(def);
    const pit = def.pits.find((p) => p.ring === v.ring && p.side === v.side && p.offset === v.offset)!;
    const period = v.period ?? VINE.period;
    for (const dir of [1, -1] as const) {
      const lip = pit.offset - dir * (pit.width / 2 - 0.1);
      let grabs = 0;
      let crossings = 0;
      let releases = 0;
      const tries = Math.round(period / 0.02);
      for (let k = 0; k < tries; k++) {
        const obs = new Obstacles(level);
        const p = new Player(level);
        p.reset({ ring: v.ring, side: v.side, offset: lip });
        for (let t = 0; t < k * 0.02; t += DT) obs.update(DT, { ring: p.ring, s: p.s, grounded: true });
        const move = { ...idle, right: dir > 0, left: dir < 0 };
        let jumped = false;
        let outcome = '';
        for (let i = 0; i < 600 && !outcome; i++) {
          const r = p.step(DT, { ...move, jump: !jumped }, obs);
          jumped = true;
          obs.update(DT, { ring: p.ring, s: p.s, grounded: p.grounded });
          if (r.grabbed) outcome = 'grab';
          else if (r.fellInPit) outcome = 'fell';
          else if (r.landed) outcome = 'landed';
        }
        if (outcome !== 'grab') continue;
        grabs++;
        // From this catch, try letting go at every moment of the next swing.
        let anyCross = false;
        for (let wait = 0; wait < period; wait += 0.02) {
          const o2 = new Obstacles(level);
          const p2 = new Player(level);
          p2.reset({ ring: v.ring, side: v.side, offset: lip });
          for (let t = 0; t < k * 0.02; t += DT) o2.update(DT, { ring: p2.ring, s: p2.s, grounded: true });
          let j2 = false;
          let held = -1;
          let result = '';
          for (let i = 0; i < 2000 && !result; i++) {
            const release = held >= 0 && held >= wait;
            const r = p2.step(DT, { ...move, jump: !j2 || release }, o2);
            j2 = true;
            o2.update(DT, { ring: p2.ring, s: p2.s, grounded: p2.grounded });
            if (p2.state === 'swing') held = held < 0 ? 0 : held + DT;
            if (r.fellInPit) result = 'fell';
            else if (r.landed) {
              const off = level.ringDelta(p2.ring, p2.s, level.spotS(pit));
              result = off * dir > 0 ? 'across' : 'back';
            }
          }
          releases++;
          if (result === 'across') {
            crossings++;
            anyCross = true;
          }
        }
        if (!anyCross) console.log(`  catch at ${(k * 0.02).toFixed(2)}s can't make it across`);
      }
      console.log(
        `${def.name} vine ${v.ring}/${v.side}/${v.offset} heading ${dir > 0 ? '+' : '-'}: ` +
          `catch ${((grabs / tries) * 100).toFixed(0)}% of the swing, ` +
          `let-go crosses ${releases ? ((crossings / releases) * 100).toFixed(0) : 0}% of the time`,
      );
    }
  }
}
