import { IndexedFluidCells } from './indexed-cells';
import { voxelizeObstacles, type WaterObstacle } from './obstacles';
import type { SdfWorld } from '../world/density';
import { insideBounds, type Vec3 } from '../world/types';
export interface FluidCell extends Vec3 { volume: number; size?:number; bottom?: number; frozen?: boolean; vx?: number; vz?: number }
// Active simulation / visible-mesh budget, not a limit on creating or saving water.
export const MAX_FLUID_CELLS = 8192;
const key = (p: Vec3) => `${p.x},${p.y},${p.z}`;
const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
const MIN_FILM = 0.04;
const floorSamples = [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92], [0.5, 0.5]] as const;
interface CellPosition extends Vec3 { id: string; terrainRevision: number; terrainFloor: number; obstacleRevision: number; floor: number }
interface Neighbors { below: CellPosition; sides: CellPosition[] }

export class FluidGrid {
  readonly cells = new IndexedFluidCells(() => { this.viewKey = ''; });
  private readonly neighbors = new WeakMap<FluidCell, Neighbors>();
  private readonly positions = new Map<string, CellPosition>();
  private obstacleRevision = 0;
  private position(x: number, y: number, z: number, id = `${x},${y},${z}`): CellPosition {
    let p = this.positions.get(id);
    if (!p) {
      p = { x, y, z, id, terrainRevision: -1, terrainFloor: 0, obstacleRevision: -1, floor: 0 };
      if (this.positions.size >= 65536) this.positions.delete(this.positions.keys().next().value!);
      this.positions.set(id, p);
    }
    return p;
  }
  private adjacent(cell: FluidCell): Neighbors {
    let neighbors = this.neighbors.get(cell);
    if (!neighbors) {
      neighbors = { below: this.position(cell.x, cell.y - this.cellSize, cell.z), sides: directions.map(([dx, dz]) => this.position(cell.x + dx * this.cellSize, cell.y, cell.z + dz * this.cellSize)) };
      this.neighbors.set(cell, neighbors);
    }
    return neighbors;
  }
  displaced = 0;
  private solids=new Map<string,number>();
  private barriers=new Set<string>();
  private staticKey='';private staticSolids=new Map<string,number>();private staticBarriers=new Set<string>();
  setObstacles(obstacles:readonly WaterObstacle[],fixed:readonly WaterObstacle[]=[]):void{
   const key=JSON.stringify(fixed);if(key!==this.staticKey){const v=voxelizeObstacles(fixed,this.cellSize);this.staticKey=key;this.staticSolids=v.occupied;this.staticBarriers=v.barriers;}
   this.viewKey='';this.obstacleRevision++;const v=voxelizeObstacles(obstacles,this.cellSize);this.solids=v.occupied;this.barriers=v.barriers;
  }
  private bottom(p:Vec3,id=key(p)):number{return this.bottomAt(this.position(p.x,p.y,p.z,id));}
  private bottomAt(p: CellPosition): number {
    if (p.terrainRevision !== this.world.edits.length) {
      p.terrainFloor = this.sampleTerrainBottom(p); p.terrainRevision = this.world.edits.length; p.obstacleRevision = -1;
    }
    if (p.obstacleRevision !== this.obstacleRevision) {
      p.floor = Math.min(this.cellSize, p.terrainFloor + Math.min(1,(this.staticSolids.get(p.id)??0)+(this.solids.get(p.id)??0)) * this.cellSize);
      p.obstacleRevision = this.obstacleRevision;
    }
    return p.floor;
  }
  private phase = 0;
  private viewKey='';private viewCache:FluidCell[]=[];
  private readonly frozen = new Map<string, number>();
  constructor(private readonly world: SdfWorld,readonly cellSize=1) {}
  private get area(){return this.cellSize*this.cellSize;}
  private get capacity(){return this.area*this.cellSize;}
  private quantize(value:number){return Math.floor(value/this.cellSize)*this.cellSize;}
  private terrainBottom(p: Vec3): number {
    const position = this.position(p.x, p.y, p.z);
    this.bottomAt(position); return position.terrainFloor;
  }
  private sampleTerrainBottom(p: Vec3): number {
    if (!insideBounds(p, this.world.bounds, this.cellSize)) return this.cellSize;
    let bottom = 0;
    // Conservative corner samples keep partially occupied cells out of the hillside.
    for (const [x, z] of floorSamples) {
      const point = { x: p.x + x*this.cellSize, y: p.y + .98*this.cellSize, z: p.z + z*this.cellSize };
      if (this.world.density(point) < 0.02) { bottom = this.cellSize; break; }
      point.y = p.y;
      if (this.world.density(point) >= 0.02) continue;
      let low = 0, high = this.cellSize;
      for (let i = 0; i < 7; i++) { const mid = (low + high) / 2; point.y = p.y + mid; if (this.world.density(point) < 0.02) low = mid; else high = mid; }
      bottom = Math.max(bottom, high);
    }
    return bottom;
  }
  add(p: Vec3, volume = this.capacity): number {
    const cell = { x: this.quantize(p.x), y: this.quantize(p.y), z: this.quantize(p.z) }, capacity = (this.cellSize - this.bottom(cell))*this.area;
    if (capacity <= 0 || !Number.isFinite(volume) || volume <= 0) return 0;
    const id = key(cell), existing = this.cells.get(id);
    const accepted = Math.max(0, Math.min(volume, capacity - (existing?.volume ?? 0)));
    if (accepted > 0) { this.viewKey=''; if (existing) existing.volume += accepted; else this.cells.set(id, { ...cell, size:this.cellSize, volume: accepted }); }
    return accepted;
  }
  drain(p: Vec3, radius: number, volume = 2): number {
    let removed = 0; this.viewKey='';
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
  private clearStaticDisplacement(cell:FluidCell,target:CellPosition):boolean{
    if(!this.staticBarriers.size)return true;
    const at=[cell.x,cell.y,cell.z],to=[target.x,target.y,target.z];let from=`${at[0]},${at[1]},${at[2]}`,steps=0;
    // Displacement targets are at most two cells up plus one horizontal cell away.
    // Check each intervening static edge rather than testing only a nonexistent diagonal edge.
    for(const axis of [1,0,2])while(Math.abs(at[axis]-to[axis])>this.cellSize*.1){
      if(++steps>3)return false;at[axis]+=Math.sign(to[axis]-at[axis])*this.cellSize;
      const next=`${at[0]},${at[1]},${at[2]}`;if(this.staticBarriers.has(`${from}/${next}`))return false;from=next;
    }
    return true;
  }
  private transfer(cell: FluidCell, sourceId: string, p: CellPosition, wanted: number, displacing=false, floor?: number): number {
    if(displacing&&!this.clearStaticDisplacement(cell,p))return 0;
    if(!displacing){const edge=`${sourceId}/${p.id}`;if(this.staticBarriers.has(edge)||this.barriers.has(edge))return 0;}
    const amount = Math.min(cell.volume, Math.max(0, wanted));
    if (amount <= 0.000001) return 0;
    const target = this.cells.get(p.id);
    const free = Math.max(0, (this.cellSize - (floor ?? this.bottomAt(p)))*this.area - (target?.volume ?? 0));
    if ((this.frozen.get(p.id) ?? 0) > this.phase) return 0;
    const accepted = Math.min(amount, free);
    let destination = target;
    if (accepted > 0) {
      if (destination) destination.volume += accepted;
      else { destination = { x: p.x, y: p.y, z: p.z, size: this.cellSize, volume: accepted }; this.cells.set(p.id, destination); }
    }
    cell.volume -= accepted;
    if (accepted > 0 && destination) {
      const pushX = (p.x - cell.x) /this.cellSize * accepted/this.capacity * 12, pushZ = (p.z - cell.z) /this.cellSize * accepted/this.capacity * 12;
      destination.vx = Math.max(-6, Math.min(6, (destination.vx ?? 0) * 0.6 + (cell.vx ?? 0) * 0.4 + pushX));
      destination.vz = Math.max(-6, Math.min(6, (destination.vz ?? 0) * 0.6 + (cell.vz ?? 0) * 0.4 + pushZ));
      cell.vx = Math.max(-6, Math.min(6, (cell.vx ?? 0) + pushX));
      cell.vz = Math.max(-6, Math.min(6, (cell.vz ?? 0) + pushZ));
    }
    if (cell.volume <= 0.000001) this.cells.delete(sourceId);
    else if (!this.cells.has(sourceId)) this.cells.set(sourceId, cell);
    return accepted;
  }
  step(centers: readonly Vec3[] = []): void {
    this.phase++;
    this.viewKey = '';
    const active = this.cells.size > 2048 && centers.length ? this.cells.nearest(centers, 2048) : this.cells.first(2048);
    active.sort((a, b) => a.cell.y - b.cell.y);
    for (const { cell } of active) { cell.vx = (cell.vx ?? 0) * 0.8; cell.vz = (cell.vz ?? 0) * 0.8; }
    for (const { id, cell } of active) {
      const until = this.frozen.get(id); if (until && until > this.phase) continue; if (until) this.frozen.delete(id);
      if (!this.cells.has(id)) continue;
      const floor = this.bottom(cell, id), capacity = (this.cellSize - floor)*this.area;
      if (cell.volume > capacity + 0.000001) {
        // Raised ground pushes water aside/up. If sealed, retain it rather than deleting it.
        let excess = cell.volume - capacity;
        for (let height = 0; height <= 2 && excess > 0.000001; height++) {
          for (let i = 0; i < 4 && excess > 0.000001; i++) {
            const [dx, dz] = directions[(i + this.phase) % 4];
            const moved = this.transfer(cell, id, this.position(cell.x + dx*this.cellSize, cell.y + height*this.cellSize, cell.z + dz*this.cellSize), excess,true);
            excess -= moved; this.displaced += moved;
          }
          if (height > 0 && excess > 0.000001) { const moved = this.transfer(cell, id, this.position(cell.x, cell.y + height*this.cellSize, cell.z), excess,true); excess -= moved; this.displaced += moved; }
        }
      }
      if (cell.volume <= 0.000001 || capacity <= 0) continue;
      const adjacent = this.adjacent(cell);
      this.transfer(cell, id, adjacent.below, cell.volume);
      if (cell.volume > MIN_FILM*this.capacity) for (let i = 0; i < 4; i++) {
        const p = adjacent.sides[(i + this.phase) % 4];
        const neighbor = this.cells.get(p.id), neighborFloor = this.bottomAt(p), neighborLevel = neighborFloor + (neighbor?.volume ?? 0)/this.area;
        const amount = Math.min(.12*this.capacity, (floor + cell.volume/this.area - neighborLevel)*this.area*.25);
        if (neighbor || amount >= MIN_FILM*this.capacity) this.transfer(cell, id, p, amount, false, neighborFloor);
      }
    }
  }
  freeze(p: Vec3, radius: number): void { this.viewKey=''; for (const c of this.cells.values()) if (Math.hypot(c.x + this.cellSize/2 - p.x, c.y + this.cellSize/2 - p.y, c.z + this.cellSize/2 - p.z) < radius) this.frozen.set(key(c), this.phase + 80); }
  iceHeight(p: Vec3): number | null { let top: number | null = null; for (const {id,cell:c} of this.cells.column(this.quantize(p.x),this.quantize(p.z))) if ((this.frozen.get(id) ?? 0) > this.phase) top = Math.max(top ?? -Infinity, c.y + this.bottom(c) + c.volume/this.area); return top; }
  surfaceHeight(x:number,z:number):number|null {
    let top=-Infinity;for(const {id,cell:c} of this.cells.column(this.quantize(x),this.quantize(z))){if(c.y>=this.world.bounds.minY&&c.y<this.world.bounds.maxY&&c.volume>.1*this.capacity)top=Math.max(top,c.y+this.bottom(c,id)+c.volume/this.area);}
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
    let accepted = 0; this.viewKey='';
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
    const viewKey=center?`${center.x},${center.z},${this.phase},${this.world.edits.length}`:'';
    if(center&&viewKey===this.viewKey)return this.viewCache;
    const cells = center ? this.cells.nearest([center], MAX_FLUID_CELLS, 48) : this.cells.first(Infinity);
    // Fixed-shape snapshot objects avoid thousands of object-spread/hidden-class transitions.
    const result=cells.map(({id,cell:c}) => ({ x:c.x, y:c.y, z:c.z, size:c.size, volume:c.volume, bottom:this.bottom(c,id), vx:Math.round((c.vx ?? 0)*1000)/1000 || 0, vz:Math.round((c.vz ?? 0)*1000)/1000 || 0, frozen:(this.frozen.get(id) ?? 0)>this.phase }));
    if(center){this.viewKey=viewKey;this.viewCache=result;}return result;
  }
}
