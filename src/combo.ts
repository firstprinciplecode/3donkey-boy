export const COMBO = { window: 2.5, max: 5 } as const;

/** Chains jump-overs made within COMBO.window seconds of each other into a points multiplier. */
export class Combo {
  count = 0;
  private timer = 0;

  /** Registers a jump-over and returns the multiplier to apply to it. */
  hit(): number {
    this.count = this.timer > 0 ? Math.min(COMBO.max, this.count + 1) : 1;
    this.timer = COMBO.window;
    return this.count;
  }

  update(dt: number): void {
    this.timer = Math.max(0, this.timer - dt);
    if (this.timer === 0) this.count = 0;
  }

  reset(): void {
    this.count = 0;
    this.timer = 0;
  }
}
