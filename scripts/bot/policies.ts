/**
 * Who presses the buttons. `scripted` is a plain reflex bot (free, repeatable, no key needed);
 * `jev` asks TypeSafe's Jev for every decision, the same shape as the typesafe-mario controller.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ACTIONS, type BotAction } from '../../src/bot/actions';
import type { BotState, Nearby } from '../../src/bot/state';

export interface Decision {
  action: BotAction;
  /** Jev only: probability of each action, how sure it was, and its side judgments. */
  probabilities?: Record<string, number>;
  confidence?: number;
  jumpUseful?: number;
  danger?: number;
  latencyMs?: number;
  tokens?: number;
}

export interface Policy {
  name: string;
  decide(state: BotState): Promise<Decision>;
}

const JUMP_REACH = 2.4;

/** Something on this floor, heading for the player, and about to arrive. */
function incoming(state: BotState): Nearby | undefined {
  return state.threats.find((t) => {
    if (t.dy < -0.8 || t.dy > 1.8) return false;
    const closing = t.vx === undefined ? true : Math.sign(t.vx) === -Math.sign(t.dx) || Math.abs(t.vx) < 0.3;
    return closing && Math.abs(t.dx) < JUMP_REACH;
  });
}

export const scripted: Policy = {
  name: 'scripted',
  async decide(state) {
    const p = state.player;
    if (p.state === 'ladder' || state.objective.action === 'up') {
      const overhead = state.threats.find((t) => t.dy > -0.5 && t.dy < 2 && Math.abs(t.dx) < 3);
      return { action: overhead && p.state === 'ladder' ? 'wait' : 'up' };
    }
    if (p.state !== 'ground') return { action: 'wait' };

    const dir = state.objective.action === 'left' ? -1 : 1;
    const move: BotAction = dir > 0 ? 'right' : 'left';
    const leap: BotAction = dir > 0 ? 'right_jump' : 'left_jump';
    if (incoming(state)) return { action: 'jump' };
    const gap = dir > 0 ? state.floor.gapRight : state.floor.gapLeft;
    if (gap && gap.at < 0.6 && gap.width < 3.2) return { action: leap };
    return { action: move };
  },
};

const RULES = {
  goal: 'Follow `objective`. It is the next step of the route to the summit. objective.action is the button to hold.',
  movement:
    'While objective.action is left or right, walk that way until objective.distance is about 0. Then the objective becomes up: press up to climb, and keep pressing up while player.state is ladder. ' +
    'Jumping is only possible from the ground and keeps your speed, so use left_jump or right_jump to clear a pit (floor.gapLeft or gapRight) that is in your way. ' +
    'Turn around only when a threat on your floor is about to hit you. Once it has passed, resume objective.action.',
  coordinates:
    'dx is distance along the ring (positive = to the right). A threat is approaching when its vx and dx have opposite signs. Threats more than 4 units away can be ignored.',
  dangers:
    'Touching any threat ends the attempt unless player.hammerSeconds > 0. A barrel on your floor (|dy| < 1.5) can be jumped. Falling in a pit ends the attempt.',
};

const ACTION_HELP: Record<BotAction, string> = {
  wait: 'Stand still for a moment, e.g. to let a threat pass or a platform arrive',
  left: 'Walk left along the ring',
  right: 'Walk right along the ring',
  jump: 'Jump straight up, to let a projectile roll underneath',
  left_jump: 'Keep moving left and jump, to clear a gap or threat on the left',
  right_jump: 'Keep moving right and jump, to clear a gap or threat on the right',
  up: 'Climb up the ladder at the player (or keep climbing)',
  down: 'Climb down the ladder at the player',
};

interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

interface SystemOneResponse {
  answers: {
    action: ChoiceAnswer;
    jump_useful: { type: 'noul'; noul: number };
    danger: { type: 'score'; score: number };
  };
  usage?: { input_tokens: number; output_tokens: number };
}

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const RETRIES = 3;

/** Fills the key from ~/.config/secrets/global.env when the shell doesn't have it. */
function vaultKey(): string | undefined {
  const already = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY;
  if (already) return already;
  const path = join(homedir(), '.config/secrets/global.env');
  if (!existsSync(path)) return undefined;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim().replace(/^export\s+/, '');
    const match = /^(JEV_API_KEY|TYPESAFE_API_KEY)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) value = value.slice(1, -1);
    if (value) return value;
  }
  return undefined;
}

export function jev(options: { model?: string } = {}): Policy {
  const apiKey = vaultKey();
  if (!apiKey) throw new Error('Set TYPESAFE_API_KEY or JEV_API_KEY to play with Jev (or use --policy scripted).');
  const model = options.model ?? 'jev-latest';
  const questions = {
    action: {
      type: 'choice',
      instructions: { rules: RULES, question: 'Which action follows `objective` for the next few frames?' },
      criteria: Object.fromEntries(Object.keys(ACTIONS).map((a) => [a, ACTION_HELP[a as BotAction]])),
    },
    jump_useful: { type: 'noul', instructions: 'Would jumping right now avoid a threat or clear a gap?' },
    danger: {
      type: 'score',
      instructions: 'How close is the player to being hit or falling?',
      criteria: ['Safe', 'Something nearby', 'Must act now'],
    },
  };

  return {
    name: 'jev',
    async decide(state) {
      const started = performance.now();
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, state, questions }),
        });
        if ((res.status === 429 || res.status === 529) && attempt < RETRIES) {
          await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
          continue;
        }
        if (!res.ok) throw new Error(`Jev answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const body = (await res.json()) as SystemOneResponse;
        const { action, jump_useful, danger } = body.answers;
        return {
          action: action.choice as BotAction,
          probabilities: action.probabilities,
          confidence: action.confidence,
          jumpUseful: jump_useful.noul,
          danger: danger.score,
          latencyMs: Math.round(performance.now() - started),
          tokens: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0),
        };
      }
    },
  };
}
