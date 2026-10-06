import type { LevelDef } from '../levels/types';

const LIMIT = 100;

/** Undo and redo stacks of whole level snapshots; levels are small, so copies are cheap. */
export class UndoStack {
  private past: LevelDef[] = [];
  private future: LevelDef[] = [];

  record(before: LevelDef): void {
    this.past.push(structuredClone(before));
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
  }

  undo(current: LevelDef): LevelDef | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(structuredClone(current));
    return previous;
  }

  redo(current: LevelDef): LevelDef | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(structuredClone(current));
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
