import type { SdfWorld } from '../world/density';
import { insideBounds, type Vec3 } from '../world/types';
export interface FluidCell extends Vec3 { volume: number }
export const MAX_FLUID_CELLS = 384;
const key = (p: Vec3) => `${p.x},${p.y},${p.z}`;
export class FluidGrid {
  readonly cells = new Map<string, FluidCell>();
  displaced = 0;
  constructor(private readonly world: SdfWorld) {}
  private open(p: Vec3): boolean { return insideBounds(p, this.world.bounds, 1) && this.world.density({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 }) > 0.1; }
  add(p: Vec3, volume = 1): number {
    const cell = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
    if (!this.open(cell) || !Number.isFinite(volume) || volume <= 0) return 0;
    const id = key(cell), existing = this.cells.get(id);
    if (!existing && this.cells.size >= MAX_FLUID_CELLS) return 0;
    const accepted = Math.min(volume, 1 - (existing?.volume ?? 0));
    if (accepted > 0) {
      if (existing) existing.volume += accepted;
      else this.cells.set(id, { ...cell, volume: accepted });
    }
    return accepted;
  }
  step(): void {
    // Snapshot each active cell once. Transfers are bounded and conserve volume.
    const active = [...this.cells.values()].sort((a, b) => a.y - b.y);
    for (const cell of active) {
      if (!this.open(cell)) { this.displaced += cell.volume; this.cells.delete(key(cell)); continue; }
      const transfer = (p: Vec3, wanted: number) => {
        const amount = this.add(p, Math.min(cell.volume, wanted)); cell.volume -= amount;
      };
      transfer({ x: cell.x, y: cell.y - 1, z: cell.z }, cell.volume);
      if (cell.volume > 0.001) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = { x: cell.x + dx, y: cell.y, z: cell.z + dz };
        const level = this.cells.get(key(p))?.volume ?? 0;
        transfer(p, Math.max(0, Math.min(0.15, (cell.volume - level) * 0.25)));
      }
      if (cell.volume <= 0.000001) this.cells.delete(key(cell));
    }
  }
  snapshot(): FluidCell[] { return [...this.cells.values()].map(c => ({ ...c })); }
}
