import { skyboundDensity } from './skybound-terrain';
import { biomeAt } from '../content/catalog';
import { BRICK_SIZE, MAX_EDITS, WORLD, brickId, insideBounds, type EditOperation, type Vec3, type WorldBounds } from './types';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function noise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const hash = (a: number, b: number) => { let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed; n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295; };
  const fx = x - ix, fz = z - iz;
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), fx * fx * (3 - 2 * fx)), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), fx * fx * (3 - 2 * fx)), fz * fz * (3 - 2 * fz));
}
export function terrainHeight(x: number, z: number, seed = WORLD.seed): number {
  return 2 + (noise(x / 35, z / 35, seed) - 0.5) * 6 + (noise(x / 11, z / 11, seed + 1) - 0.5) * 1.2;
}
export function landscapeHeight(x:number,z:number,seed=WORLD.seed):number {
 const base=terrainHeight(x,z,seed),biome=biomeAt(x,z),edge=Math.min(1,Math.hypot(x,z)/45);
 const broad=noise(x/28,z/28,seed+13);
 if(biome.id==='dusk')return base+edge*(2+6*broad);
 if(biome.id==='mire')return base-edge*3.5+noise(x/8,z/8,seed+25)*0.5;
 if(biome.id==='frost')return base+edge*(5+9*(1-Math.abs(broad*2-1)));
 if(biome.id==='rift')return base+edge*(Math.sin(x/13)*Math.cos(z/16)*2);
 return base;
}
export function meadowsHeight(x:number,z:number,seed=WORLD.seed):number {
 const hills=terrainHeight(x,z,seed)+noise(x/60,z/60,seed+71)*2;
 const creek=-24+Math.sin(z*.04)*4,river=Math.exp(-(((x-creek)/3.5)**2))*5;
 const lake=Math.max(0,1-Math.hypot(x+34,z+40)/15)*7;
 const shore=Math.max(0,Math.min(1,(-x-65)/20));
 return hills*(1-shore)-shore*3-Math.max(river,lake);
}
const caveFloors=new Map<string,number>();
function generatedCave(p:Vec3,seed:number):number {
 if(p.y>18 || p.y<-14)return 100;
 const tx=Math.round(p.x/96)*96,tz=Math.round(p.z/96)*96;
 if(Math.hypot(tx,tz)<50)return 100;
 const key=seed+','+tx+','+tz;let floor=caveFloors.get(key);if(floor===undefined){floor=landscapeHeight(tx,tz,seed)-3;if(caveFloors.size>4096)caveFloors.clear();caveFloors.set(key,floor);}
 const x=Math.max(tx-15,Math.min(tx+15,p.x)),z=tz+Math.sin((x-tx)/10)*4;
 let d=Math.hypot(p.x-x,p.y-floor,p.z-z)-2.5;
 // Rooms and connecting corridors form an excavatable underground ruin.
 if(tx===96 && tz===0)for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
  const room=Math.max(Math.abs(p.x-(tx+i*9))-3.5,Math.abs(p.y-(floor-3))-2.7,Math.abs(p.z-(tz+j*9))-3.5);
  d=Math.min(d,room);
  d=Math.min(d,Math.max(Math.abs(p.x-tx)-12,Math.abs(p.y-(floor-3))-1.6,Math.abs(p.z-(tz+j*9))-1.7));
 }
 return d;
}
function naturalArch(p:Vec3,seed:number):number {
 if(Math.abs(p.x-87)>9 || Math.abs(p.z+16)>4)return 100;
 const y=landscapeHeight(87,-16,seed);
 const solid=Math.max(Math.abs(p.x-87)-7,Math.abs(p.y-y-3.8)-4,Math.abs(p.z+16)-1.8);
 const opening=Math.max(Math.abs(p.x-87)-4.5,Math.abs(p.y-y-1.2)-2.8,Math.abs(p.z+16)-3);
 return Math.max(solid,-opening);
}
function riftIsland(p:Vec3):number {
 if(p.x>-40 || p.z<40 || p.y<10 || biomeAt(p.x,p.z).id!=='rift')return 100;
 const x=Math.round(p.x/96)*96,z=Math.round(p.z/96)*96,y=18+Math.sin(x+z)*3;
 return (Math.hypot((p.x-x)/1.5,(p.y-y)/0.6,(p.z-z)/1.2)-5)*0.6;
}
function cave(p: Vec3): number {
  // Rounded tunnel opens on a hillside; the density remains fully 3D.
  const x = Math.max(-16, Math.min(-4, p.x));
  return Math.hypot(p.x - x, p.y + 0.2, p.z + 9) - 2.7;
}
function island(p: Vec3): number {
  return (Math.hypot((p.x - 13) / 1.7, (p.y - 15) / 0.65, (p.z + 17) / 1.3) - 4) * 0.65;
}
export class SdfWorld {
  readonly edits: EditOperation[] = [];
  private readonly undone = new Set<number>();
  private readonly heights = new Map<string,number>();
  private readonly index = new Map<string, EditOperation[]>();
  constructor(readonly bounds: WorldBounds = { ...WORLD }, readonly generator: 1 | 2 | 3 | 4 = 1) {}
  heightAt(x:number,z:number):number {const id=x+','+z,previous=this.heights.get(id);if(previous!==undefined)return previous;const h=this.generator>=3?meadowsHeight(x,z,this.bounds.seed):this.generator===2?landscapeHeight(x,z,this.bounds.seed):terrainHeight(x,z,this.bounds.seed);if(this.heights.size>=16384)this.heights.clear();this.heights.set(id,h);return h;}
  isAnchor(p:Vec3):boolean {
    if(p.y<this.bounds.minY+2)return true;
    if(Math.hypot(p.x-13,p.y-15,p.z+17)<1.2)return true;
    if(this.generator===2 && p.x<-40 && p.z>40){const x=Math.round(p.x/96)*96,z=Math.round(p.z/96)*96,y=18+Math.sin(x+z)*3;if(Math.hypot(p.x-x,p.y-y,p.z-z)<1.2)return true;}
    return false;
  }
  density(p: Vec3): number {
    if (!insideBounds(p, this.bounds)) return 100;
    let d = this.generator===4?skyboundDensity(p,this.heightAt(p.x,p.z)):this.generator===3?p.y-this.heightAt(p.x,p.z):Math.min(Math.max(p.y - this.heightAt(p.x, p.z), -cave(p)), island(p));
    if(this.generator===2) d=Math.min(Math.max(d,-generatedCave(p,this.bounds.seed)),naturalArch(p,this.bounds.seed),riftIsland(p));
    const entries = this.index.get(brickId(Math.floor(p.x / BRICK_SIZE), Math.floor(p.y / BRICK_SIZE), Math.floor(p.z / BRICK_SIZE)));
    if (entries) for (const e of entries) {
      if(this.undone.has(e.id))continue;
      const sphere = e.shape==='cylinder'?Math.max(Math.hypot(p.x-e.position.x,p.z-e.position.z)-e.radius,Math.abs(p.y-e.position.y)-e.radius):Math.hypot(p.x - e.position.x, p.y - e.position.y, p.z - e.position.z) - e.radius;
      d = e.kind === 'dig' ? Math.max(d, -sphere) : Math.min(d, sphere);
    }
    return d;
  }
  soilAt(p:Vec3):boolean {
    const entries=this.index.get(brickId(Math.floor(p.x/BRICK_SIZE),Math.floor(p.y/BRICK_SIZE),Math.floor(p.z/BRICK_SIZE)));
    return !!entries?.some(e=>!this.undone.has(e.id)&&e.surface==='soil'&&Math.hypot(p.x-e.position.x,p.z-e.position.z)<e.radius&&Math.abs(p.y-(e.position.y+(e.kind==='add'?e.radius:-e.radius)))<.3);
  }
  affectedBricks(e: EditOperation): string[] {
    const ids: string[] = [];
    // One sample of padding updates shared boundaries and normal gradients.
    const r = e.radius + 1;
    for (let x = Math.floor((e.position.x - r) / BRICK_SIZE); x <= Math.floor((e.position.x + r) / BRICK_SIZE); x++)
      for (let y = Math.floor((e.position.y - r) / BRICK_SIZE); y <= Math.floor((e.position.y + r) / BRICK_SIZE); y++)
        for (let z = Math.floor((e.position.z - r) / BRICK_SIZE); z <= Math.floor((e.position.z + r) / BRICK_SIZE); z++) ids.push(brickId(x, y, z));
    return ids;
  }
  apply(e: EditOperation): string[] {
    if (this.edits.length >= MAX_EDITS || !Number.isSafeInteger(e.id) || e.id !== this.edits.length + 1 || !Number.isSafeInteger(e.tick) || e.tick < 0 || e.tick > 1000000000000 || (e.kind !== 'dig' && e.kind !== 'add') || e.material !== 'stone' || (e.shape!==undefined&&e.shape!=='cylinder') || (e.surface!==undefined&&e.surface!=='soil') || !Number.isFinite(e.radius) || e.radius < 0.2 || e.radius > 2.5 || !insideBounds(e.position, this.bounds, e.radius)) throw new Error('地形編集の範囲または上限が不正です');
    const operation: EditOperation = { ...e, position: { ...e.position } };
    if(e.undo!==undefined){
      const original=this.edits[e.undo-1];
      if(!Number.isSafeInteger(e.undo)||!original||original.undo!==undefined||this.undone.has(e.undo)||original.kind!==e.kind||original.radius!==e.radius||original.shape!==e.shape||original.surface!==e.surface||['x','y','z'].some(axis=>original.position[axis as keyof Vec3]!==e.position[axis as keyof Vec3]))throw Error('取消の参照が不正です');
      this.undone.add(e.undo);this.edits.push(operation);return this.affectedBricks(original);
    }
    this.edits.push(operation);
    const affected = this.affectedBricks(operation);
    for (const id of affected) { const list = this.index.get(id) ?? []; list.push(operation); this.index.set(id, list); }
    return affected;
  }
  private gradient(p: Vec3, out: Vec3): number {
    const h = 0.02;
    out.x = this.density({ x: p.x + h, y: p.y, z: p.z }) - this.density({ x: p.x - h, y: p.y, z: p.z });
    out.y = this.density({ x: p.x, y: p.y + h, z: p.z }) - this.density({ x: p.x, y: p.y - h, z: p.z });
    out.z = this.density({ x: p.x, y: p.y, z: p.z + h }) - this.density({ x: p.x, y: p.y, z: p.z - h });
    const length = Math.hypot(out.x, out.y, out.z);
    if (length < 0.00001) { out.x = 0; out.y = 1; out.z = 0; return 1; }
    out.x /= length; out.y /= length; out.z /= length;
    return length / (2 * h);
  }
  normal(p: Vec3, out: Vec3): Vec3 {
    this.gradient(p, out);
    return out;
  }
  surfaceDistance(p: Vec3, normal: Vec3): number {
    // The terrain density is an implicit field, not an exact Euclidean SDF.
    // Normalize its slope before using it as a collision distance.
    const density = this.density(p);
    const slope = this.gradient(p, normal);
    // At CSG creases, central differences can average opposing gradients.
    // Never overestimate free space because that averaged gradient is small.
    return density / Math.max(density >= 0 ? 1 : 0.25, slope);
  }
}

