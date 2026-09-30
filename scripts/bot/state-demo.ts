/**
 * Prints the JSON the bot (and Jev) would see at the start of each level, without calling Jev.
 * Handy for checking the state before spending anything on API calls.
 *
 *   npm run bot:state                 every level
 *   npm run bot:state -- --level 3    one level
 *   npm run bot:state -- --shot       also save artifacts/bot/level-N.png
 */
import { mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { openGame } from './browser';

const LEVEL_COUNT = 7;
const { values } = parseArgs({
  options: {
    level: { type: 'string' },
    seed: { type: 'string', default: '1' },
    shot: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
  },
});

const levels = values.level ? [Number(values.level)] : Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);
const session = await openGame({ headed: values.headed });
try {
  if (values.shot) mkdirSync('artifacts/bot', { recursive: true });
  for (const level of levels) {
    await session.start(level, Number(values.seed));
    const { state } = await session.act('wait', 30);
    console.log(`\n── Level ${level}: ${state.level.name} ──`);
    console.log(JSON.stringify(state, null, 2));
    if (values.shot) await session.page.screenshot({ path: `artifacts/bot/level-${level}.png` });
  }
} finally {
  await session.close();
}
