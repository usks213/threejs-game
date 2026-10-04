import { voxelizeObstacles, type WaterObstacle } from './obstacles';
import type { SdfWorld } from '../world/density';
import { insideBounds, type Vec3 } from '../world/types';
export interface FluidCell extends Vec3 { volume: number; bottom?: number; frozen?: boolean; vx?: number; vz?: number }
// Active simulation / visible-mesh budget, not a limit on creating or saving water.
export const MAX_FLUID_CELLS = 2048;
const key = (p: Vec3) => `${p.x},${p.y},${p.z}`;
const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
const MIN_FILM = 0.04;
export class FluidGrid {
  readonly cells = new Map<string, FluidCell>();
  displaced = 0;
  private solids=new Map<string,number>();
  private barriers=new Set<string>();
  setObstacles(obstacles:readonly WaterObstacle[]):void{const v=voxelizeObstacles(obstacles);this.solids=v.occupied;this.barriers=v.barriers;}
  private bottom(p:Vec3):number{return Math.min(1,this.terrainBottom(p)+(this.solids.get(key(p))??0));}
  private revision = -1;
  private phase = 0;
  private readonly frozen = new Map<string, number>();
  private readonly floors = new Map<string, number>();
  constructor(private readonly world: SdfWorld) {}
  private terrainBottom(p: Vec3): number {
    if (!insideBounds(p, this.world.bounds, 1)) return 1;
    if (this.revision !== this.world.edits.length) { this.floors.clear(); this.revision = this.world.edits.length; }
    const id = key(p), cached = this.floors.get(id);
    if (cached !== undefined) return cached;
    let bottom = 0;
    // Conservative corner samples keep partially occupied cells out of the hillside.
    for (const [x, z] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92], [0.5, 0.5]]) {
      const point = { x: p.x + x, y: p.y + 0.98, z: p.z + z };
      if (this.world.density(point) < 0.02) { bottom = 1; break; }
      point.y = p.y;
      if (this.world.density(point) >= 0.02) continue;
      let low = 0, high = 1;
      for (let i = 0; i < 7; i++) { const mid = (low + high) / 2; point.y = p.y + mid; if (this.world.density(point) < 0.02) low = mid; else high = mid; }
      bottom = Math.max(bottom, high);
    }
    if (this.floors.size >= 4096) this.floors.clear();
    this.floors.set(id, bottom); return bottom;
  }
  add(p: Vec3, volume = 1): number {
    const cell = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) }, capacity = 1 - this.bottom(cell);
    if (capacity <= 0 || !Number.isFinite(volume) || volume <= 0) return 0;
    const id = key(cell), existing = this.cells.get(id);
    const accepted = Math.max(0, Math.min(volume, capacity - (existing?.volume ?? 0)));
    if (accepted > 0) { if (existing) existing.volume += accepted; else this.cells.set(id, { ...cell, volume: accepted }); }
    return accepted;
  }
  drain(p: Vec3, radius: number, volume = 2): number {
    let removed = 0;
    for (const [id, cell] of this.cells) {
      if (Math.hypot(cell.x + 0.5 - p.x, cell.y + 0.5 - p.y, cell.z + 0.5 - p.z) > radius) continue;
      const amount = Math.min(cell.volume, volume - removed); cell.volume -= amount; removed += amount;
      if (cell.volume <= 0.000001) { this.cells.delete(id); this.frozen.delete(id); }
      if (removed >= volume) break;
    }
    return removed;
  }
  restore(cells: FluidCell[]): void {
    this.cells.clear(); this.frozen.clear();
    // Old saves may contain water overlapped by terrain: preserve it until redistribution.
    for (const c of cells) { this.cells.set(key(c), { x: c.x, y: c.y, z: c.z, volume: c.volume, vx: c.vx ?? 0, vz: c.vz ?? 0 }); if(c.frozen)this.frozen.set(key(c),this.phase+80); }
  }
  private transfer(cell: FluidCell, p: Vec3, wanted: number, displacing=false): number {
    if(!displacing&&this.barriers.has(`${key(cell)}/${key(p)}`))return 0;
    const amount = Math.min(cell.volume, Math.max(0, wanted));
    if (amount <= 0.000001) return 0;
    const id = key(cell), target = this.cells.get(key(p));
    const free = Math.max(0, 1 - this.bottom(p) - (target?.volume ?? 0));
    if ((this.frozen.get(key(p)) ?? 0) > this.phase) return 0;
    const accepted = this.add(p, Math.min(amount, free)); cell.volume -= accepted;
    if (accepted > 0) {
      const destination = this.cells.get(key(p))!;
      const pushX = (p.x - cell.x) * accepted * 12, pushZ = (p.z - cell.z) * accepted * 12;
      destination.vx = Math.max(-6, Math.min(6, (destination.vx ?? 0) * 0.6 + (cell.vx ?? 0) * 0.4 + pushX));
      destination.vz = Math.max(-6, Math.min(6, (destination.vz ?? 0) * 0.6 + (cell.vz ?? 0) * 0.4 + pushZ));
      cell.vx = Math.max(-6, Math.min(6, (cell.vx ?? 0) + pushX));
      cell.vz = Math.max(-6, Math.min(6, (cell.vz ?? 0) + pushZ));
    }
    if (cell.volume <= 0.000001) this.cells.delete(id);
    else if (!this.cells.has(id)) this.cells.set(id, cell);
    return accepted;
  }
  step(centers: readonly Vec3[] = []): void {
    this.phase++;
    let active = [...this.cells.values()];
    if (active.length > MAX_FLUID_CELLS) {
      if (centers.length) { const nearest = (c: Vec3) => { let best=Infinity; for(const p of centers) best=Math.min(best,(p.x-c.x)**2+(p.z-c.z)**2); return best; }; const distance = (c: Vec3) => nearest(c); active.sort((a,b) => distance(a)-distance(b)); }
      active = active.slice(0, MAX_FLUID_CELLS);
    }
    active.sort((a, b) => a.y - b.y);
    for (const cell of active) { cell.vx = (cell.vx ?? 0) * 0.8; cell.vz = (cell.vz ?? 0) * 0.8; }
    for (const cell of active) {
      const until = this.frozen.get(key(cell)); if (until && until > this.phase) continue; if (until) this.frozen.delete(key(cell));
      if (!this.cells.has(key(cell))) continue;
      const floor = this.bottom(cell), capacity = 1 - floor;
      if (cell.volume > capacity + 0.000001) {
        // Raised ground pushes water aside/up. If sealed, retain it rather than deleting it.
        let excess = cell.volume - capacity;
        for (let height = 0; height <= 2 && excess > 0.000001; height++) {
          for (let i = 0; i < 4 && excess > 0.000001; i++) {
            const [dx, dz] = directions[(i + this.phase) % 4];
            const moved = this.transfer(cell, { x: cell.x + dx, y: cell.y + height, z: cell.z + dz }, excess,true);
            excess -= moved; this.displaced += moved;
          }
          if (height > 0 && excess > 0.000001) { const moved = this.transfer(cell, { x: cell.x, y: cell.y + height, z: cell.z }, excess,true); excess -= moved; this.displaced += moved; }
        }
      }
      if (cell.volume <= 0.000001 || capacity <= 0) continue;
      this.transfer(cell, { x: cell.x, y: cell.y - 1, z: cell.z }, cell.volume);
      if (cell.volume > MIN_FILM) for (let i = 0; i < 4; i++) {
        const [dx, dz] = directions[(i + this.phase) % 4], p = { x: cell.x + dx, y: cell.y, z: cell.z + dz };
        const neighbor = this.cells.get(key(p)), neighborLevel = this.bottom(p) + (neighbor?.volume ?? 0);
        const amount = Math.min(0.12, (floor + cell.volume - neighborLevel) * 0.25);
        if (neighbor || amount >= MIN_FILM) this.transfer(cell, p, amount);
      }
    }
  }
  freeze(p: Vec3, radius: number): void { for (const c of this.cells.values()) if (Math.hypot(c.x + 0.5 - p.x, c.y + 0.5 - p.y, c.z + 0.5 - p.z) < radius) this.frozen.set(key(c), this.phase + 80); }
  iceHeight(p: Vec3): number | null { let top: number | null = null; for (const c of this.cells.values()) if (c.x === Math.floor(p.x) && c.z === Math.floor(p.z) && (this.frozen.get(key(c)) ?? 0) > this.phase) top = Math.max(top ?? -Infinity, c.y + this.bottom(c) + c.volume); return top; }
  immersion(p: Vec3, height: number): number {
    let depth = 0;
    const x = Math.floor(p.x), z = Math.floor(p.z);
    for (let y = Math.floor(p.y); y <= Math.floor(p.y + height); y++) {
      const c = this.cells.get(`${x},${y},${z}`); if (!c || (this.frozen.get(key(c)) ?? 0) > this.phase) continue;
      const bottom = y + this.bottom(c), top = bottom + c.volume;
      depth += Math.max(0, Math.min(p.y + height, top) - Math.max(p.y, bottom));
    }
    return Math.min(1, depth / height);
  }
  current(p: Vec3, height = 1.45): { x: number; z: number } {
    const x = Math.floor(p.x), z = Math.floor(p.z); let vx = 0, vz = 0, weight = 0;
    for (let y = Math.floor(p.y); y <= Math.floor(p.y + height); y++) {
      const id = `${x},${y},${z}`, c = this.cells.get(id);
      if (!c || (this.frozen.get(id) ?? 0) > this.phase) continue;
      const bottom = y + this.bottom(c), depth = Math.max(0, Math.min(p.y + height, bottom + c.volume) - Math.max(p.y, bottom));
      vx += (c.vx ?? 0) * depth; vz += (c.vz ?? 0) * depth; weight += depth;
    }
    return { x: weight ? vx / weight : 0, z: weight ? vz / weight : 0 };
  }
  pour(p: Vec3, direction: { x: number; z: number }, volume = 12): number {
    let accepted = 0;
    const length = Math.hypot(direction.x, direction.z) || 1;
    // Find free air above the aimed point, including when it is already full or inside terrain.
    for (let y = Math.floor(p.y); y < this.world.bounds.maxY - 1 && accepted < volume; y++) {
      for (let x = -1; x <= 1 && accepted < volume; x++) for (let z = -1; z <= 1 && accepted < volume; z++) {
        const point = { x: Math.floor(p.x) + x, y, z: Math.floor(p.z) + z };
        const amount = this.add(point, Math.min(1, volume - accepted)); accepted += amount;
        const cell = this.cells.get(key(point));
        if (cell) { this.frozen.delete(key(point)); cell.vx = direction.x / length * 5; cell.vz = direction.z / length * 5; }
      }
    }
    return accepted;
  }
  snapshot(center?: Vec3): FluidCell[] {
    let cells = [...this.cells.values()];
    if (center) {
      const distance = (c: Vec3) => (c.x-center.x)**2+(c.z-center.z)**2;
      cells = cells.filter(c => distance(c) < 48**2).sort((a,b) => distance(a)-distance(b)).slice(0, MAX_FLUID_CELLS);
    }
    return cells.map(c => ({ ...c, bottom: this.bottom(c), vx: Math.round((c.vx ?? 0) * 1000) / 1000 || 0, vz: Math.round((c.vz ?? 0) * 1000) / 1000 || 0, frozen: (this.frozen.get(key(c)) ?? 0) > this.phase }));
  }
}
