import { voxelizeObstacles, type WaterObstacle } from './obstacles';
import type { SdfWorld } from '../world/density';
import { insideBounds, type Vec3 } from '../world/types';
export interface FluidCell extends Vec3 { volume: number; size?:number; bottom?: number; frozen?: boolean; vx?: number; vz?: number }
// Active simulation / visible-mesh budget, not a limit on creating or saving water.
export const MAX_FLUID_CELLS = 8192;
const key = (p: Vec3) => `${p.x},${p.y},${p.z}`;
const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
const MIN_FILM = 0.04;
export class FluidGrid {
  readonly cells = new Map<string, FluidCell>();
  displaced = 0;
  private solids=new Map<string,number>();
  private barriers=new Set<string>();
  setObstacles(obstacles:readonly WaterObstacle[]):void{const v=voxelizeObstacles(obstacles,this.cellSize);this.solids=v.occupied;this.barriers=v.barriers;}
  private bottom(p:Vec3):number{return Math.min(this.cellSize,this.terrainBottom(p)+(this.solids.get(key(p))??0)*this.cellSize);}
  private revision = -1;
  private phase = 0;
  private viewKey='';private viewCache:FluidCell[]=[];
  private readonly frozen = new Map<string, number>();
  private readonly floors = new Map<string, number>();
  constructor(private readonly world: SdfWorld,readonly cellSize=1) {}
  private get area(){return this.cellSize*this.cellSize;}
  private get capacity(){return this.area*this.cellSize;}
  private quantize(value:number){return Math.floor(value/this.cellSize)*this.cellSize;}
  private terrainBottom(p: Vec3): number {
    if (!insideBounds(p, this.world.bounds, this.cellSize)) return this.cellSize;
    if (this.revision !== this.world.edits.length) { this.floors.clear(); this.revision = this.world.edits.length; }
    const id = key(p), cached = this.floors.get(id);
    if (cached !== undefined) return cached;
    let bottom = 0;
    // Conservative corner samples keep partially occupied cells out of the hillside.
    for (const [x, z] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92], [0.5, 0.5]]) {
      const point = { x: p.x + x*this.cellSize, y: p.y + .98*this.cellSize, z: p.z + z*this.cellSize };
      if (this.world.density(point) < 0.02) { bottom = this.cellSize; break; }
      point.y = p.y;
      if (this.world.density(point) >= 0.02) continue;
      let low = 0, high = this.cellSize;
      for (let i = 0; i < 7; i++) { const mid = (low + high) / 2; point.y = p.y + mid; if (this.world.density(point) < 0.02) low = mid; else high = mid; }
      bottom = Math.max(bottom, high);
    }
    if (this.floors.size >= 65536) this.floors.clear();
    this.floors.set(id, bottom); return bottom;
  }
  add(p: Vec3, volume = this.capacity): number {
    const cell = { x: this.quantize(p.x), y: this.quantize(p.y), z: this.quantize(p.z) }, capacity = (this.cellSize - this.bottom(cell))*this.area;
    if (capacity <= 0 || !Number.isFinite(volume) || volume <= 0) return 0;
    const id = key(cell), existing = this.cells.get(id);
    const accepted = Math.max(0, Math.min(volume, capacity - (existing?.volume ?? 0)));
    if (accepted > 0) { if (existing) existing.volume += accepted; else this.cells.set(id, { ...cell, size:this.cellSize, volume: accepted }); }
    return accepted;
  }
  drain(p: Vec3, radius: number, volume = 2): number {
    let removed = 0;
    for (const [id, cell] of this.cells) {
      if (Math.hypot(cell.x + this.cellSize/2 - p.x, cell.y + this.cellSize/2 - p.y, cell.z + this.cellSize/2 - p.z) > radius) continue;
      const amount = Math.min(cell.volume, volume - removed); cell.volume -= amount; removed += amount;
      if (cell.volume <= 0.000001) { this.cells.delete(id); this.frozen.delete(id); }
      if (removed >= volume) break;
    }
    return removed;
  }
  restore(cells: FluidCell[]): void {
    this.cells.clear(); this.frozen.clear();
    // Old saves may contain water overlapped by terrain: preserve it until redistribution.
    const legacy=this.cellSize===1?this:new FluidGrid(this.world);
    for(const c of cells){const size=c.size??1;if(size===this.cellSize){this.cells.set(key(c),{...c,size, vx:c.vx??0,vz:c.vz??0});if(c.frozen)this.frozen.set(key(c),this.phase+80);continue;}
      const bottom=Math.min(size-c.volume/(size*size),c.bottom??legacy.terrainBottom(c)),top=bottom+c.volume/(size*size);
      for(let dx=0;dx<size;dx+=this.cellSize)for(let dz=0;dz<size;dz+=this.cellSize)for(let dy=0;dy<size;dy+=this.cellSize){const volume=Math.max(0,Math.min(top,dy+this.cellSize)-Math.max(bottom,dy))*this.area;if(volume<=1e-8)continue;const n={x:c.x+dx,y:c.y+dy,z:c.z+dz,volume,size:this.cellSize,vx:c.vx??0,vz:c.vz??0};this.cells.set(key(n),n);if(c.frozen)this.frozen.set(key(n),this.phase+80);}
    }
  }
  private transfer(cell: FluidCell, p: Vec3, wanted: number, displacing=false): number {
    if(!displacing&&this.barriers.has(`${key(cell)}/${key(p)}`))return 0;
    const amount = Math.min(cell.volume, Math.max(0, wanted));
    if (amount <= 0.000001) return 0;
    const id = key(cell), target = this.cells.get(key(p));
    const free = Math.max(0, (this.cellSize - this.bottom(p))*this.area - (target?.volume ?? 0));
    if ((this.frozen.get(key(p)) ?? 0) > this.phase) return 0;
    const accepted = this.add(p, Math.min(amount, free)); cell.volume -= accepted;
    if (accepted > 0) {
      const destination = this.cells.get(key(p))!;
      const pushX = (p.x - cell.x) /this.cellSize * accepted/this.capacity * 12, pushZ = (p.z - cell.z) /this.cellSize * accepted/this.capacity * 12;
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
    if (active.length > 2048) {
      if (centers.length) { const nearest = (c: Vec3) => { let best=Infinity; for(const p of centers) best=Math.min(best,(p.x-c.x)**2+(p.z-c.z)**2); return best; }; const distance = (c: Vec3) => nearest(c); active.sort((a,b) => distance(a)-distance(b)); }
      active = active.slice(0,2048);
    }
    active.sort((a, b) => a.y - b.y);
    for (const cell of active) { cell.vx = (cell.vx ?? 0) * 0.8; cell.vz = (cell.vz ?? 0) * 0.8; }
    for (const cell of active) {
      const until = this.frozen.get(key(cell)); if (until && until > this.phase) continue; if (until) this.frozen.delete(key(cell));
      if (!this.cells.has(key(cell))) continue;
      const floor = this.bottom(cell), capacity = (this.cellSize - floor)*this.area;
      if (cell.volume > capacity + 0.000001) {
        // Raised ground pushes water aside/up. If sealed, retain it rather than deleting it.
        let excess = cell.volume - capacity;
        for (let height = 0; height <= 2 && excess > 0.000001; height++) {
          for (let i = 0; i < 4 && excess > 0.000001; i++) {
            const [dx, dz] = directions[(i + this.phase) % 4];
            const moved = this.transfer(cell, { x: cell.x + dx*this.cellSize, y: cell.y + height*this.cellSize, z: cell.z + dz*this.cellSize }, excess,true);
            excess -= moved; this.displaced += moved;
          }
          if (height > 0 && excess > 0.000001) { const moved = this.transfer(cell, { x: cell.x, y: cell.y + height*this.cellSize, z: cell.z }, excess,true); excess -= moved; this.displaced += moved; }
        }
      }
      if (cell.volume <= 0.000001 || capacity <= 0) continue;
      this.transfer(cell, { x: cell.x, y: cell.y - this.cellSize, z: cell.z }, cell.volume);
      if (cell.volume > MIN_FILM*this.capacity) for (let i = 0; i < 4; i++) {
        const [dx, dz] = directions[(i + this.phase) % 4], p = { x: cell.x + dx*this.cellSize, y: cell.y, z: cell.z + dz*this.cellSize };
        const neighbor = this.cells.get(key(p)), neighborLevel = this.bottom(p) + (neighbor?.volume ?? 0)/this.area;
        const amount = Math.min(.12*this.capacity, (floor + cell.volume/this.area - neighborLevel)*this.area*.25);
        if (neighbor || amount >= MIN_FILM*this.capacity) this.transfer(cell, p, amount);
      }
    }
  }
  freeze(p: Vec3, radius: number): void { for (const c of this.cells.values()) if (Math.hypot(c.x + this.cellSize/2 - p.x, c.y + this.cellSize/2 - p.y, c.z + this.cellSize/2 - p.z) < radius) this.frozen.set(key(c), this.phase + 80); }
  iceHeight(p: Vec3): number | null { let top: number | null = null; for (const c of this.cells.values()) if (c.x === this.quantize(p.x) && c.z === this.quantize(p.z) && (this.frozen.get(key(c)) ?? 0) > this.phase) top = Math.max(top ?? -Infinity, c.y + this.bottom(c) + c.volume/this.area); return top; }
  surfaceHeight(x:number,z:number):number|null {
    let top=-Infinity;for(let y=this.world.bounds.minY;y<this.world.bounds.maxY;y+=this.cellSize){const c=this.cells.get(`${this.quantize(x)},${y},${this.quantize(z)}`);if(c&&c.volume>.1*this.capacity)top=Math.max(top,y+this.bottom(c)+c.volume/this.area);}
    return Number.isFinite(top)?top:null;
  }
  immersion(p: Vec3, height: number): number {
    let depth = 0;
    const x = this.quantize(p.x), z = this.quantize(p.z);
    for (let y = this.quantize(p.y); y <= this.quantize(p.y + height); y+=this.cellSize) {
      const c = this.cells.get(`${x},${y},${z}`); if (!c || (this.frozen.get(key(c)) ?? 0) > this.phase) continue;
      const bottom = y + this.bottom(c), top = bottom + c.volume/this.area;
      depth += Math.max(0, Math.min(p.y + height, top) - Math.max(p.y, bottom));
    }
    return Math.min(1, depth / height);
  }
  current(p: Vec3, height = 1.45): { x: number; z: number } {
    const x = this.quantize(p.x), z = this.quantize(p.z); let vx = 0, vz = 0, weight = 0;
    for (let y = this.quantize(p.y); y <= this.quantize(p.y + height); y+=this.cellSize) {
      const id = `${x},${y},${z}`, c = this.cells.get(id);
      if (!c || (this.frozen.get(id) ?? 0) > this.phase) continue;
      const bottom = y + this.bottom(c), depth = Math.max(0, Math.min(p.y + height, bottom + c.volume/this.area) - Math.max(p.y, bottom));
      vx += (c.vx ?? 0) * depth; vz += (c.vz ?? 0) * depth; weight += depth;
    }
    return { x: weight ? vx / weight : 0, z: weight ? vz / weight : 0 };
  }
  pour(p: Vec3, direction: { x: number; z: number }, volume = 12): number {
    let accepted = 0;
    const length = Math.hypot(direction.x, direction.z) || 1;
    // Find free air above the aimed point, including when it is already full or inside terrain.
    for (let y = this.quantize(p.y); y < this.world.bounds.maxY - this.cellSize && accepted < volume; y+=this.cellSize) {
      for (let x = -1; x <= 1 && accepted < volume; x+=this.cellSize) for (let z = -1; z <= 1 && accepted < volume; z+=this.cellSize) {
        const point = { x: this.quantize(p.x) + x, y, z: this.quantize(p.z) + z };
        const amount = this.add(point, Math.min(this.capacity, volume - accepted)); accepted += amount;
        const cell = this.cells.get(key(point));
        if (cell) { this.frozen.delete(key(point)); cell.vx = direction.x / length * 5; cell.vz = direction.z / length * 5; }
      }
    }
    return accepted;
  }
  snapshot(center?: Vec3): FluidCell[] {
    const viewKey=center?`${Math.floor(center.x)},${Math.floor(center.z)},${this.phase},${this.cells.size}`:'';if(center&&viewKey===this.viewKey)return this.viewCache;
    let cells = [...this.cells.values()];
    if (center) {
      const distance = (c: Vec3) => (c.x-center.x)**2+(c.z-center.z)**2;
      cells = cells.filter(c => distance(c) < 48**2).sort((a,b) => distance(a)-distance(b)).slice(0, MAX_FLUID_CELLS);
    }
    const result=cells.map(c => ({ ...c, bottom: this.bottom(c), vx: Math.round((c.vx ?? 0) * 1000) / 1000 || 0, vz: Math.round((c.vz ?? 0) * 1000) / 1000 || 0, frozen: (this.frozen.get(key(c)) ?? 0) > this.phase }));if(center){this.viewKey=viewKey;this.viewCache=result;}return result;
  }
}
