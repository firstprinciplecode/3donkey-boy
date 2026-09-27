import type { Controls } from './entities/player';

const CAPTURED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

/** Keyboard state: `held` for movement, edge-triggered `pressed` for jump/menu keys. */
export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => {
      this.held.clear();
      this.pressed.clear();
    });
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
      left: this.held.has('ArrowLeft'),
      right: this.held.has('ArrowRight'),
      up: this.held.has('ArrowUp'),
      down: this.held.has('ArrowDown'),
      jump: this.pressed.has('Space'),
    };
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
