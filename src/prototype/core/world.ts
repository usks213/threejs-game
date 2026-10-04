import { VoxelField,capsule,ellipsoid,type Vec3 } from './voxel';
export interface ObjectState {id:string;kind:'door'|'chest'|'tree'|'valve'|'altar'|'resource'|'hearth'|'artisan'|'cache'|'gate'|'anchor'|'plant';name:string;open:boolean;hp:number}
export function createArena(field=new VoxelField()){
 const objects=new Map<string,ObjectState>();
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:number,id?:string,r=.08)=>field.box({x,y,z},{x:x+w,y:y+h,z:z+d},m,id,r);
 const orb=(c:Vec3,r:Vec3,m:number,id?:string)=>field.shape({x:c.x-r.x,y:c.y-r.y,z:c.z-r.z},{x:c.x+r.x,y:c.y+r.y,z:c.z+r.z},ellipsoid(c,r),m,id);
 const limb=(a:Vec3,b:Vec3,r:number,m:number,id?:string)=>field.shape({x:Math.min(a.x,b.x)-r,y:Math.min(a.y,b.y)-r,z:Math.min(a.z,b.z)-r},{x:Math.max(a.x,b.x)+r,y:Math.max(a.y,b.y)+r,z:Math.max(a.z,b.z)+r},capsule(a,b,r),m,id);
 // Sample a continuous terrain function into voxels. Flat courtyard meets weathered rolling ground.
 field.shape({x:-12,y:-1,z:-20},{x:12,y:.45,z:10},p=>{
  const outside=Math.min(1,Math.max(0,(Math.abs(p.x)-5)/2)),top=.25+outside*(Math.sin(p.x*.8+p.z*.4)*.13+Math.sin(p.z*1.7)*.07);
  return Math.max(p.y-top,-1-p.y,Math.abs(p.x)-12,Math.abs(p.z+5)-15);
 },2);
 box(-4.7,0,-11.7,9.4,.25,12.4,3,undefined,0);
 field.box({x:4,y:-.5,z:-5},{x:10,y:1,z:1},0);
 // A vaulted, roofed crypt: openings and arches are CSG cuts in continuous stone, not cube walls.
 box(-5,.25,-12,.55,4.3,13.3,3);box(4.45,.25,-12,.55,4.3,13.3,3);box(-5,.25,-12,10,4.3,.55,3);
 box(-5,.25,.75,4,3.9,.55,3);box(1,.25,.75,4,3.9,.55,3);box(-1,2.75,.75,2,1.4,.55,3);
 field.shape({x:-1,y:2,z:.4},{x:1,y:3.4,z:1.6},p=>Math.max(Math.hypot(p.x,p.y-2.25)-1,Math.abs(p.z-1)-.7),0,undefined,true);
 // Barrel vault overhead, with a curved inner surface.
 field.shape({x:-5,y:3.5,z:-12},{x:5,y:6,z:1.3},p=>Math.max(Math.hypot(p.x,(p.y-3.7)*1.8)-5.1,3.7-p.y,Math.abs(p.z+5.35)-6.65),3);
 field.shape({x:-4.5,y:3.6,z:-11.6},{x:4.5,y:5.8,z:.8},p=>Math.max(Math.hypot(p.x,(p.y-3.7)*1.8)-4.5,3.6-p.y,Math.abs(p.z+5.4)-6.2),0,undefined,true);
 for(const z of [-2.5,-6.5,-10.5])for(const x of [-4.2,4.2]){limb({x,y:.4,z},{x,y:3.9,z},.25,3);orb({x,y:3.8,z},{x:.4,y:.25,z:.4},3);box(x-.4,.25,z-.4,.8,.3,.8,3);}
 // Broken arch and sculpted rock at the approach.
 for(const x of [-2.2,2.2]){limb({x,y:.35,z:4},{x,y:2.3,z:4},.3,3);orb({x,y:2.5,z:4},{x:.45,y:.3,z:.38},3);}
 for(const [x,z,r] of [[-6,6,.8],[7,7,1.1],[-6,-3,.7],[10,-9,1.4]])orb({x,y:.3,z},{x:r,y:r*.7,z:r*.85},3);
 const object=(id:string,kind:ObjectState['kind'],name:string,hp=3)=>objects.set(id,{id,kind,name,open:false,hp});
 // Labeled, reachable material studies beside spawn; the central approach stays clear.
 object('sample-wood','resource','木材実験 · 伐採 / 燃焼',100);
 limb({x:-2.7,y:.58,z:6.25},{x:-1.35,y:.58,z:6.25},.32,4,'sample-wood');
 limb({x:-2.7,y:.58,z:6.95},{x:-1.35,y:.58,z:6.95},.32,5,'sample-wood');
 object('sample-grass','resource','草実験 · 燃焼',100);
 for(const x of [-3.8,-3.45,-3.1])orb({x,y:.5,z:7.9},{x:.24,y:.34,z:.35},7,'sample-grass');
 object('sample-metal','resource','金属実験 · 電導',100);
 limb({x:1.6,y:.8,z:7.1},{x:3.8,y:.8,z:7.1},.19,6,'sample-metal');
 for(const x of [1.6,3.8])limb({x,y:.3,z:7.1},{x,y:1.1,z:7.1},.19,6,'sample-metal');
 object('sample-stone','resource','石実験 · 冷却 / 採掘',100);
 orb({x:-4.5,y:.45,z:6.8},{x:.55,y:.55,z:.5},3,'sample-stone');
 object('door','door','樫の扉');setDoor(field,false);
 object('chest','chest','補給箱');box(-3.25,.25,-3.75,1.5,.75,.75,4,'chest',.15);orb({x:-2.5,y:1,z:-3.375},{x:.75,y:.3,z:.375},5,'chest');box(-2.65,.65,-3.86,.3,.3,.13,6,'chest');
 for(const [i,x,z] of [[0,-7,3],[1,-8,-7],[2,8,4],[3,-7,-15]]){
  const id='tree'+i;object(id,'tree','樹木',4);limb({x,y:.25,z},{x:x+.12,y:3.7,z:z+.05},.28,4,id);
  for(let branch=0;branch<4;branch++){const angle=branch*2.2+i,bx=x+Math.cos(angle)*1.25,bz=z+Math.sin(angle)*1.25;limb({x,y:2,z},{x:bx,y:3.7+branch*.15,z:bz},.16,4,id);orb({x:bx,y:4+branch*.18,z:bz},{x:1.05,y:.75,z:.95},7,id);}
  orb({x,y:4.6,z},{x:1.1,y:1,z:1.05},7,id);
 }
 object('valve','valve','水門のレバー');box(3,.25,-3,.5,.75,.5,3,'valve');limb({x:3.25,y:.9,z:-2.75},{x:3.25,y:1.5,z:-2.9},.13,6,'valve');
 object('altar','altar','試練の碑');box(-1,.25,-10.75,2,.5,1,3,'altar');orb({x:0,y:1.3,z:-10.5},{x:.45,y:.85,z:.28},8,'altar');
 for(const x of [-4,4]){limb({x,y:.3,z:-5},{x,y:1.8,z:-5},.13,4);orb({x,y:1.95,z:-5},{x:.18,y:.3,z:.18},9);}
 box(6,-.5,-4,.3,.75,3,3);return {field,objects};
}
export function setDoor(field:VoxelField,open:boolean){
 field.removeObject('door');field.box(open?{x:-1,y:.25,z:1}:{x:-1,y:.25,z:.75},open?{x:-.65,y:2.75,z:3}:{x:1,y:2.75,z:1.1},4,'door',.045);
}
/** Authoritative voxel body for line-of-sight selection; combat uses the articulated capsule pose. */
export function creatureVoxels(){
 const f=new VoxelField(.0625);
 const part=(c:Vec3,r:Vec3,m:number)=>f.shape({x:c.x-r.x,y:c.y-r.y,z:c.z-r.z},{x:c.x+r.x,y:c.y+r.y,z:c.z+r.z},ellipsoid(c,r),m);
 part({x:0,y:1.15,z:0},{x:.32,y:.42,z:.19},10);part({x:0,y:1.62,z:0},{x:.16,y:.2,z:.17},6);
 for(const x of [-.17,.17]){part({x,y:.45,z:0},{x:.12,y:.48,z:.13},10);part({x:x*2,y:1.04,z:0},{x:.12,y:.38,z:.12},10);}return f;
}
