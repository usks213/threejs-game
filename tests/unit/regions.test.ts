import {beforeAll,describe,expect,it} from 'vitest';
import {VoxelField} from '../../src/prototype/core/voxel';
import type {ObjectState} from '../../src/prototype/core/world';
import {extendRegionalWorld} from '../../src/prototype/core/regional-world';
import {REGIONS,POIS,REGIONAL_POINTS,REGIONAL_ENEMIES,REGIONAL_UPGRADES,REGIONAL_QUESTS,regionAt,regionUnlocked,regionalHazard,isRegionalOpen} from '../../src/prototype/core/regions';

describe('original regional content catalogue',()=>{
 it('contains seven different climates and bounded compact pockets with meaningful POIs',()=>{
  expect(REGIONS).toHaveLength(7);expect(new Set(REGIONS.map(r=>r.climate)).size).toBe(7);
  let area=0;
  for(const r of REGIONS){const b=r.bounds;area+=(b.maxX-b.minX)*(b.maxZ-b.minZ);expect(b.minX).toBeGreaterThanOrEqual(-34);expect(b.maxX).toBeLessThanOrEqual(34);expect(b.minZ).toBeGreaterThanOrEqual(-54);expect(b.maxZ).toBeLessThanOrEqual(12);expect(r.route.length).toBeGreaterThan(1);expect(regionAt(r.route.at(-1)!)?.id).toBe(r.id);expect(REGIONAL_POINTS.some(p=>p.region===r.id&&p.reward.items)).toBe(true);expect(REGIONAL_ENEMIES.some(e=>e.region===r.id)).toBe(true);}
  expect(area).toBeLessThan(1200);
  expect(new Set(POIS.flatMap(p=>p.tags)).size).toBe(10);
  for(const poi of POIS){expect(REGIONS.some(r=>r.id===poi.region)).toBe(true);expect(REGIONAL_POINTS.some(p=>p.id===poi.rewardPoint)).toBe(true);expect(poi.objective.length).toBeGreaterThan(3);expect(poi.obstacle.length).toBeGreaterThan(3);expect(regionAt(poi.entry)?.id).toBe(poi.region);expect(regionAt(poi.exit)?.id).toBe(poi.region);}
 });
 it('uses unique object/enemy identities and three distinct boss tactics',()=>{
  expect(new Set(REGIONAL_POINTS.map(p=>p.id)).size).toBe(REGIONAL_POINTS.length);expect(new Set(REGIONAL_ENEMIES.map(e=>e.id)).size).toBe(REGIONAL_ENEMIES.length);
  const bosses=REGIONAL_ENEMIES.filter(e=>e.boss);expect(bosses).toHaveLength(3);expect(new Set(bosses.map(e=>e.tactic)).size).toBe(3);
  for(const e of REGIONAL_ENEMIES){expect(regionAt(e.position)?.id).toBe(e.region);expect(e.hp).toBeGreaterThan(0);expect(e.telegraph.length).toBeGreaterThan(0);}
 });
 it('keeps post-P1 dependencies acyclic and upgrade costs obtainable before entering the next region',()=>{
  const tokens:string[]=['ridge-arrival'],items:Record<string,number>={};
  expect(regionUnlocked('hearthfield',[])).toBe(false);
  for(const [index,region] of REGIONS.entries()){
   expect(regionUnlocked(region.id,tokens)).toBe(true);
   for(const future of REGIONS.slice(index+1))expect(regionUnlocked(future.id,tokens)).toBe(false);
   for(const reward of [...REGIONAL_POINTS.filter(p=>p.region===region.id).map(p=>p.reward),...REGIONAL_ENEMIES.filter(e=>e.region===region.id).map(e=>e.reward)])for(const [id,n] of Object.entries(reward.items??{})){tokens.push(id);items[id]=(items[id]??0)+n;}
   const next=REGIONS[index+1];
   if(next){const upgrade=REGIONAL_UPGRADES.find(u=>u.opens===next.id)!;expect(upgrade).toBeDefined();expect(upgrade.requires.every(id=>tokens.includes(id))).toBe(true);for(const [id,n] of Object.entries(upgrade.cost)){expect(items[id]).toBeGreaterThanOrEqual(n);items[id]-=n;}}
  }
  expect(REGIONAL_QUESTS.at(-1)?.next).toBe('free-build');
  expect(REGIONAL_QUESTS.at(-1)?.completionText).toContain('自由建築');
 });
 it('gates boss caches with tokens awarded by an earlier encounter in the same region',()=>{
  for(const point of REGIONAL_POINTS)for(const token of point.requires??[])expect(REGIONAL_ENEMIES.some(e=>e.region===point.region&&e.reward.items?.[token])).toBe(true);
 });
 it('describes climate hazards, oxygen boundary, and wraparound night hours deterministically',()=>{
  expect(regionalHazard({x:27,y:3.25,z:-32},2).shroudDrain).toBe(6);expect(regionalHazard({x:27,y:3.25,z:-32},4).shroudDrain).toBe(1);
  expect(regionalHazard({x:-7,y:5.25,z:-50},3).coldPerSecond).toBe(2);
  expect(regionalHazard({x:13,y:1.25,z:-50},5).submerged).toBe(true);expect(regionalHazard({x:13,y:3.25,z:-50},5).submerged).toBe(false);
  expect(isRegionalOpen([18,6],18)).toBe(true);expect(isRegionalOpen([18,6],5.99)).toBe(true);expect(isRegionalOpen([18,6],6)).toBe(false);expect(isRegionalOpen([18,6],12)).toBe(false);expect(isRegionalOpen([18,6],NaN)).toBe(false);
 });
});

describe('regional world physical content',()=>{
 const arena={field:new VoxelField(),objects:new Map<string,ObjectState>()};
 beforeAll(()=>{extendRegionalWorld(arena);},30000);
 it('authors every interaction point as visible persistent geometry',()=>{
  const visible=new Set([...arena.field.cells.values()].filter(c=>c.distance<0).map(c=>c.object));
  for(const point of REGIONAL_POINTS){expect(arena.objects.get(point.id)?.kind).toBe(point.kind);expect(visible.has(point.id),point.id).toBe(true);}
  expect([...arena.objects.keys()].filter(id=>id.startsWith('rg-tree-')).length).toBeGreaterThan(6);
 });
 it('provides joined solid corridor floors rather than labels over empty space',()=>{
  for(const r of REGIONS)for(let i=1;i<r.route.length;i++){const a=r.route[i-1],b=r.route[i];for(let n=0;n<=10;n++){const t=n/10;expect(arena.field.distance({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t-.35,z:a.z+(b.z-a.z)*t}),`${r.id} route ${i}/${n}`).toBeLessThan(0);}}
 });
 it('has walk-in cave/mine interiors, a roofed hamlet, rootfen deck, and a lowered lakebed',()=>{
  for(const p of [{x:-30,y:1.4,z:-9},{x:-30,y:4.5,z:-27},{x:-25,y:1.5,z:3}])expect(arena.field.distance(p)).toBeGreaterThan(0);
  expect(arena.field.distance({x:-25,y:2.9,z:3})).toBeLessThan(0);
  expect(arena.field.distance({x:28,y:2.1,z:-13.5})).toBeLessThan(0);
  expect(arena.field.distance({x:14,y:2.5,z:-50})).toBeGreaterThan(0);
  expect(arena.field.distance({x:14,y:1.14,z:-50})).toBeLessThan(0);
 });
 it('does not author over the original hearth, artisan, warden, or ridge destination',()=>{
  for(const p of [{x:-3,y:.25,z:4},{x:-2.5,y:.25,z:-3.5},{x:2,y:.25,z:-9},{x:0,y:3.25,z:-31}])expect(arena.field.distance(p)).toBeGreaterThan(0);
  expect(arena.field.size).toBe(.25);
 });
});
