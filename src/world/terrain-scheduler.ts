import { sameFieldLod } from './field-data';
import { BRICK_SIZE, type Brick, type Vec3 } from './types';

/** The expensive job itself is deliberately absent: this queue runs on the simulation thread. */
export interface TerrainJob {
  epoch: number;
  version: number;
  editCount: number;
  brick: Brick;
}
interface Entry { brick: Brick; version: number; pending: boolean; ready: boolean; dirty: boolean; bytes: number }
/** Only completed extra residents count against this budget; demanded terrain is unchanged. */
export const TERRAIN_RETENTION_LIMITS = { entries: 768, bytes: 16 * 1024 * 1024 } as const;
function distanceSquared(brick: Brick, focus: Vec3): number {
  const p = brick.origin, half = BRICK_SIZE / 2;
  return (p.x + half - focus.x) ** 2 + (p.y + half - focus.y) ** 2 + (p.z + half - focus.z) ** 2;
}
export class TerrainScheduler {
  private readonly entries = new Map<string, Entry>();
  private sequence = 0;
  private active: TerrainJob | null = null;
  private focus: Vec3 = { x: 0, y: 0, z: 0 };
  epoch = 0;
  paused = false;

  reset(): void { this.epoch++; this.entries.clear(); this.active = null; }
  get size(): number { return this.entries.size; }
  get pending(): number { let n = 0; for (const entry of this.entries.values()) if (!entry.ready) n++; return n; }
  get dirtyPending(): number { let n = 0; for (const entry of this.entries.values()) if (entry.dirty) n++; return n; }
  get ids(): IterableIterator<string> { return this.entries.keys(); }
  setFocus(focus: Vec3): void { this.focus = { ...focus }; }

  setVisible(bricks: Map<string, Brick>, focus: Vec3, retain?: (brick: Brick) => boolean): string[] {
    this.setFocus(focus);
    const removed: string[] = [], retained: Entry[] = [];
    const remove = (id: string) => { this.entries.delete(id); removed.push(id); };
    for (const [id, entry] of this.entries) if (!bricks.has(id)) {
      // Do not keep speculative/in-flight work alive merely because it is in the halo.
      if (entry.ready && retain?.(entry.brick)) retained.push(entry);
      else remove(id);
    }
    retained.sort((a, b) => distanceSquared(a.brick, focus) - distanceSquared(b.brick, focus));
    let retainedBytes = 0, retainedCount = 0;
    for (const entry of retained) {
      if (retainedCount >= TERRAIN_RETENTION_LIMITS.entries || retainedBytes + entry.bytes > TERRAIN_RETENTION_LIMITS.bytes) remove(entry.brick.id);
      else { retainedBytes += entry.bytes; retainedCount++; }
    }
    for (const [id, brick] of bricks) {
      const previous = this.entries.get(id);
      if (previous && previous.brick.step === brick.step && previous.brick.origin.x === brick.origin.x && previous.brick.origin.y === brick.origin.y && previous.brick.origin.z === brick.origin.z && sameFieldLod(previous.brick.fieldLod, brick.fieldLod)) continue;
      this.entries.set(id, { brick, version: ++this.sequence, pending: true, ready: false, dirty: previous?.dirty ?? false, bytes: 0 });
    }
    return removed;
  }
  invalidate(ids: Iterable<string>): void {
    for (const id of new Set(ids)) {
      const entry = this.entries.get(id); if (!entry) continue;
      entry.version = ++this.sequence; entry.pending = true; entry.ready = false; entry.dirty = true;
    }
  }
  next(editCount: number): TerrainJob | null {
    if (this.paused || this.active) return null;
    let best: Entry | undefined, distance = Infinity;
    for (const entry of this.entries.values()) {
      if (!entry.pending) continue;
      const nextDistance = distanceSquared(entry.brick, this.focus);
      if (!best || (entry.dirty && !best.dirty) || (entry.dirty === best.dirty && nextDistance < distance)) { best = entry; distance = nextDistance; }
    }
    if (!best) return null;
    best.pending = false;
    return this.active = { epoch: this.epoch, version: best.version, editCount, brick: best.brick };
  }
  /** Ignore duplicate/out-of-order completions without releasing a different active job. */
  complete(job: TerrainJob, bytes = 0): 'stream' | 'edit' | null {
    if (!this.active || job.epoch !== this.active.epoch || job.version !== this.active.version || job.brick.id !== this.active.brick.id || job.editCount !== this.active.editCount) return null;
    this.active = null;
    const entry = this.entries.get(job.brick.id);
    if (job.epoch !== this.epoch || !entry || entry.version !== job.version) return null;
    const result = entry.dirty ? 'edit' : 'stream';
    entry.ready = true; entry.dirty = false; entry.bytes = bytes;
    return result;
  }
  readyNear(focus: Vec3): boolean {
    if (!this.entries.size) return false;
    for (const { brick, ready } of this.entries.values()) {
      if (!ready && Math.hypot(brick.origin.x + BRICK_SIZE / 2 - focus.x, brick.origin.z + BRICK_SIZE / 2 - focus.z) < 14 && Math.abs(brick.origin.y + BRICK_SIZE / 2 - focus.y) < 12) return false;
    }
    return true;
  }
}

/** Credits count meshes handed to rendering, rather than messages (an edit is one batch). */
export class TerrainUploadWindow {
  private epoch = 0;
  private outstanding = 0;
  constructor(readonly limit = 4) {}
  reset(epoch: number): void { this.epoch = epoch; this.outstanding = 0; }
  get available(): boolean { return this.outstanding < this.limit; }
  sent(count: number): void { this.outstanding += count; }
  acknowledge(epoch: number, count: number): void {
    if (epoch !== this.epoch || !Number.isSafeInteger(count) || count < 1) return;
    this.outstanding = Math.max(0, this.outstanding - count);
  }
}
