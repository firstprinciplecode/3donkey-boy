import type { Controls } from './entities/player';

const CAPTURED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

export type InputMode = 'keys' | 'touch' | 'pad';

/** Standard-mapping gamepad buttons to the key codes the game already understands. */
const PAD_BUTTONS: Record<number, string> = {
  0: 'Space', // A / cross: jump, confirm
  1: 'Space', // B / circle
  3: 'GamepadY', // Y / triangle: quit from menus, desktop build only
  8: 'KeyM', // back / select: mute
  9: 'KeyP', // start: pause
  12: 'ArrowUp',
  13: 'ArrowDown',
  14: 'ArrowLeft',
  15: 'ArrowRight',
};
const STICK_DEAD_ZONE = 0.45;

/**
 * Keyboard, touch and gamepad folded into key codes: `held` for movement, edge-triggered
 * `pressed` for jump/menu. Each source keeps its own held set, so releasing a key doesn't
 * cancel a finger still on the pad.
 */
export class Input {
  private readonly keys = new Set<string>();
  private readonly virtual = new Set<string>();
  private readonly pad = new Set<string>();
  private readonly pressed = new Set<string>();
  /** Maps a physical key code to the game code it stands for; see `setKeyMap`. */
  private keyMap: Readonly<Record<string, string>> = {};
  mode: InputMode = 'keys';
  onModeChange: ((mode: InputMode) => void) | null = null;
  /** While typing initials, keys mean themselves so remapped letters still type. */
  textEntry = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      const code = this.textEntry ? e.code : (this.keyMap[e.code] ?? e.code);
      if (CAPTURED.has(code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(code);
      this.keys.add(code);
      this.setMode('keys');
    });
    target.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const mapped = this.keyMap[e.code];
      if (mapped) this.keys.delete(mapped);
    });
    target.addEventListener('blur', () => {
      this.keys.clear();
      this.virtual.clear();
      this.pad.clear();
      this.pressed.clear();
    });
  }

  /** Physical key → game code overrides (remapped keys). The defaults always keep working too. */
  setKeyMap(map: Readonly<Record<string, string>>): void {
    this.keyMap = map;
    this.keys.clear();
  }

  setMode(mode: InputMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.onModeChange?.(mode);
  }

  /** On-screen controls: hold or release a code, with a press edge on the way down. */
  touch(code: string, down: boolean): void {
    if (down) {
      if (!this.virtual.has(code)) this.pressed.add(code);
      this.virtual.add(code);
      this.setMode('touch');
    } else {
      this.virtual.delete(code);
    }
  }

  /** Reads the first connected gamepad; call once per frame before the game reads input. */
  poll(): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p?.connected);
    const now = new Set<string>();
    if (gp) {
      for (const [index, code] of Object.entries(PAD_BUTTONS)) {
        if (gp.buttons[Number(index)]?.pressed) now.add(code);
      }
      const [x = 0, y = 0] = gp.axes;
      if (x < -STICK_DEAD_ZONE) now.add('ArrowLeft');
      if (x > STICK_DEAD_ZONE) now.add('ArrowRight');
      if (y < -STICK_DEAD_ZONE) now.add('ArrowUp');
      if (y > STICK_DEAD_ZONE) now.add('ArrowDown');
    }
    for (const code of now) {
      if (!this.pad.has(code)) {
        this.pressed.add(code);
        this.setMode('pad');
      }
    }
    this.pad.clear();
    for (const code of now) this.pad.add(code);
  }

  private held(code: string): boolean {
    return this.keys.has(code) || this.virtual.has(code) || this.pad.has(code);
  }

  consume(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  /** Letter keys pressed since the last frame, in the order they were hit. */
  consumeLetters(): string[] {
    const letters: string[] = [];
    for (const code of this.pressed) {
      if (!/^Key[A-Z]$/.test(code)) continue;
      letters.push(code.slice(3));
      this.pressed.delete(code);
    }
    return letters;
  }

  controls(): Controls {
    return {
      left: this.held('ArrowLeft'),
      right: this.held('ArrowRight'),
      up: this.held('ArrowUp'),
      down: this.held('ArrowDown'),
      jump: this.pressed.has('Space'),
    };
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
