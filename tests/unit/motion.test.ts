import {describe,it,expect} from 'vitest';
import {attackPose,attacks,bladeWorld,segmentDistance} from '../../src/prototype/core/motion';
import {VoxelField,sphere} from '../../src/prototype/core/voxel';
import {extractSurface} from '../../src/prototype/core/surface';
import {CoreSimulation,type Controls} from '../../src/prototype/core/simulation';
const idle:Controls={x:0,z:0,block:false,sprint:false,water:false};
describe('SDF extraction and editing',()=>{
 it('extracts a smooth curved surface whose vertices match the collision distance field',()=>{const f=new VoxelField(.125);f.shape({x:-1,y:-1,z:-1},{x:1,y:1,z:1},sphere({x:0,y:0,z:0},1),3);const mesh=extractSurface(f);expect(mesh.positions.length).toBeGreaterThan(1000);let error=0;for(let i=0;i<mesh.positions.length;i+=3){const p={x:mesh.positions[i],y:mesh.positions[i+1],z:mesh.positions[i+2]};error=Math.max(error,Math.abs(f.distance(p)));}expect(error).toBeLessThan(.00001);expect(mesh.normals.some(n=>Math.abs(n)>.2&&Math.abs(n)<.8)).toBe(true);
  const hit=f.ray({x:0,y:0,z:3},{x:0,y:0,z:-1},4)!;expect(hit.distance).toBeCloseTo(2,1);f.dirty.clear();f.carve(hit.point,.4);expect(f.distance({...hit.point,z:hit.point.z-.1})).toBeGreaterThan(0);expect(f.dirty.size).toBeGreaterThan(0);expect(f.dirty.size).toBeLessThan(10);expect(f.ray({x:0,y:0,z:3},{x:0,y:0,z:-1},4)!.distance).toBeGreaterThan(hit.distance+.2);
 });
});
describe('authored continuous combat motion',()=>{
 it('keeps blade length constant and position/velocity continuous across phase boundaries',()=>{for(const kind of ['slash','return','overhead'] as const){const d=attacks[kind];for(const [left,time,right] of [['windup',d.windup,'strike'],['strike',d.strike,'recover']] as const){const a=attackPose(kind,left,time-1e-5),b=attackPose(kind,right,0),c=attackPose(kind,right,1e-5);expect(Math.hypot(a.tip.x-b.tip.x,a.tip.y-b.tip.y,a.tip.z-b.tip.z)).toBeLessThan(.001);expect(Math.hypot(c.tip.x-b.tip.x,c.tip.y-b.tip.y,c.tip.z-b.tip.z)).toBeLessThan(.001);for(const axis of ['x','y','z'] as const)expect(Math.abs((b.tip[axis]-a.tip[axis])/1e-5-(c.tip[axis]-b.tip[axis])/1e-5)).toBeLessThan(.02);}
  for(let t=0;t<d.strike;t+=.01){const p=attackPose(kind,'strike',t);expect(Math.hypot(p.tip.x-p.grip.x,p.tip.y-p.grip.y,p.tip.z-p.grip.z)).toBeCloseTo(d.reach,6);}
 }});
 it('uses a swept edge rather than granting damage instantly at the start of the strike',()=>{const s=new CoreSimulation();s.player.position={x:0,y:.25,z:-4.6};s.enemies[1].hp=0;s.action('attack',idle);for(let i=0;i<23;i++)s.tick(1/60,idle);expect(s.enemies[0].hp).toBe(100);for(let i=0;i<25;i++)s.tick(1/60,idle);expect(s.enemies[0].hp).toBeLessThan(100);const hp=s.enemies[0].hp;for(let i=0;i<20;i++)s.tick(1/60,idle);expect(s.enemies[0].hp).toBe(hp);});
 it('does not hit a body outside the blade trajectory and respects walls',()=>{const s=new CoreSimulation();s.player.position={x:0,y:.25,z:-4.6};s.player.yaw=Math.PI;s.enemies[1].hp=0;s.enemies[0].phase='stagger';s.action('attack',idle);for(let i=0;i<55;i++)s.tick(1/60,idle);expect(s.enemies[0].hp).toBe(100);
  s.player.yaw=0;s.player.phase='idle';s.arena.field.box({x:-2,y:.25,z:-5.2},{x:2,y:3,z:-5},3);s.action('attack',idle);for(let i=0;i<55;i++)s.tick(1/60,idle);expect(s.enemies[0].hp).toBe(100);
 });
 it('transforms blade direction with pitch and measures segment contact',()=>{const p=attackPose('slash','strike',.14),a=bladeWorld(p,{x:0,y:0,z:0},0,0),b=bladeWorld(p,{x:0,y:0,z:0},0,.5);expect(b.tip.y).toBeGreaterThan(a.tip.y);expect(segmentDistance({x:-1,y:0,z:0},{x:1,y:0,z:0},{x:0,y:-1,z:0},{x:0,y:1,z:0})).toBeCloseTo(0);});
});
