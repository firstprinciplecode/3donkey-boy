/**
 * Plays levels with a test bot and reports how each attempt went. One attempt = one life:
 * it ends when the player clears the level, dies, or runs out of time.
 *
 *   npm run bot:play                                  scripted bot, every level, 3 attempts each
 *   npm run bot:play -- --policy jev --level 2        Jev plays Candy Hills (needs TYPESAFE_API_KEY)
 *   npm run bot:play -- --runs 10 --headed            watch it play
 *
 * Every decision is logged to artifacts/bot/<run>/level-N-attempt-M.jsonl (state, action, Jev's
 * probabilities and latency), with a summary.json next to them.
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { openGame } from './browser';
import { jev, scripted, type Policy } from './policies';

const LEVEL_COUNT = 7;
const FPS = 60;
const { values } = parseArgs({
  options: {
    policy: { type: 'string', default: 'scripted' },
    level: { type: 'string', default: 'all' },
    runs: { type: 'string', default: '3' },
    frames: { type: 'string', default: '8' },
    seed: { type: 'string', default: '1' },
    'max-seconds': { type: 'string', default: '120' },
    model: { type: 'string' },
    headed: { type: 'boolean', default: false },
  },
});

const policy: Policy = values.policy === 'jev' ? jev({ model: values.model }) : scripted;
const levels = values.level === 'all' ? Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1) : [Number(values.level)];
const runs = Number(values.runs);
const frames = Number(values.frames);
const maxFrames = Number(values['max-seconds']) * FPS;
const seed = Number(values.seed);

const dir = join('artifacts/bot', `${new Date().toISOString().replace(/[:.]/g, '-')}-${policy.name}`);
mkdirSync(dir, { recursive: true });

interface Attempt {
  level: number;
  name: string;
  attempt: number;
  seed: number;
  outcome: string;
  cause?: string;
  seconds: number;
  score: number;
  highestRing: number;
  decisions: number;
  avgLatencyMs?: number;
  tokens?: number;
}

const results: Attempt[] = [];
const session = await openGame({ headed: values.headed });
try {
  for (const level of levels) {
    for (let attempt = 1; attempt <= runs; attempt++) {
      const attemptSeed = seed + attempt - 1;
      const log = join(dir, `level-${level}-attempt-${attempt}.jsonl`);
      let state = await session.start(level, attemptSeed);
      let ran = 0;
      let decisions = 0;
      let latency = 0;
      let tokens = 0;
      let highestRing = state.player.ring;
      let outcome = 'timeout';
      let cause: string | undefined;

      while (ran < maxFrames) {
        const started = performance.now();
        if (values.headed) await session.show({ thinking: true });
        const decision = await policy.decide(state);
        await session.show(decision);
        const report = await session.act(decision.action, frames);
        if (values.headed) {
          await pace(started, report.frames);
          if (decisions === 8) await session.page.screenshot({ path: join(dir, 'watch.png') });
        }
        decisions++;
        ran += report.frames;
        latency += decision.latencyMs ?? 0;
        tokens += decision.tokens ?? 0;
        highestRing = Math.max(highestRing, report.state.player.ring);
        appendFileSync(log, JSON.stringify({ t: +(ran / FPS).toFixed(2), state, ...decision, outcome: report.outcome, cause: report.cause }) + '\n');
        state = report.state;
        if (report.outcome !== 'playing') {
          outcome = report.outcome;
          cause = report.cause;
          break;
        }
      }

      const result: Attempt = {
        level,
        name: state.level.name,
        attempt,
        seed: attemptSeed,
        outcome,
        ...(cause ? { cause } : {}),
        seconds: +(ran / FPS).toFixed(1),
        score: state.run.score,
        highestRing,
        decisions,
        ...(policy.name === 'jev' ? { avgLatencyMs: Math.round(latency / Math.max(1, decisions)), tokens } : {}),
      };
      results.push(result);
      const mark = outcome === 'cleared' ? '✓' : '✗';
      const where = outcome === 'cleared' ? '' : ` on ring ${state.player.ring + 1}/${state.level.rings}`;
      console.log(`${mark} L${level} ${state.level.name} #${attempt}: ${outcome}${cause ? ` (${cause})` : ''}${where} after ${result.seconds}s`);
    }
  }
} finally {
  await session.close();
}

const byLevel = levels.map((level) => {
  const mine = results.filter((r) => r.level === level);
  const cleared = mine.filter((r) => r.outcome === 'cleared').length;
  return { level, name: mine[0]?.name, cleared, attempts: mine.length, causes: countBy(mine.map((r) => r.cause ?? r.outcome)) };
});
writeFileSync(join(dir, 'summary.json'), JSON.stringify({ policy: policy.name, frames, seed, byLevel, attempts: results }, null, 2));
console.log('\nLevel                 Cleared');
for (const l of byLevel) console.log(`${`${l.level}. ${l.name}`.padEnd(22)}${l.cleared}/${l.attempts}   ${JSON.stringify(l.causes)}`);
console.log(`\nLogs: ${dir}`);

/** A watched game should run at game speed. Headless runs stay as fast as the machine allows. */
async function pace(started: number, framesPlayed: number): Promise<void> {
  const wait = (framesPlayed / FPS) * 1000 - (performance.now() - started);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

function countBy(list: string[]): Record<string, number> {
  return list.reduce<Record<string, number>>((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});
}
