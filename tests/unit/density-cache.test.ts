import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {SdfWorld,terrainHeight,landscapeHeight,meadowsHeight} from '../../src/world/density';
import {WORLD} from '../../src/world/types';
// Exact pre-optimization field values, including every generator and add/dig/undo.
const hashes=[['6b87e611685f6bfc0ef3a6d662c363e176862e132083105081b02f2adeb36b95','223da960308f0c04650f5342e7bd57904e6778a754eeb5067b00694db6dd619b'],['c7c4934c374054ad4073dab5e96d1f0a785a01360d35de4d5df6a2764257bdb5','ca919068a73fc288f0230d1e6e32fd4eab3773d72c1a72f871617a647b508a2a'],['0580b235161189f954ea3d9b910f3406fb68a5404010dd542bdbcbba5250ef10','ac234fbf0d76778e3996d2c9975210fff212249b09648bfa215d6a8a7217559b'],['93c4b4c0ee9809156cc693e1967f2d3ca66fc22cf8add8b2bd39df3dbf48a816','141fd6003cd88ac57d9baf2b4ce4ec121d21762f09cf4d31a4f2c78191a600dc']];
for(const generator of [1,2,3,4] as const)for(const [seedIndex,seed]of [1,7319].entries())it(`preserves generator ${generator}/seed ${seed} density, heights and soil exactly through edits`,()=>{
 const world=new SdfWorld({...WORLD,seed},generator),values:unknown[]=[];let random=1947;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32;};
 const points=Array.from({length:500},(_,i)=>({x:(next()-.5)*(i%2?1800:200),y:next()*62-15,z:(next()-.5)*(i%2?1800:200)}));points.push({x:7.9,y:2,z:7.9},{x:8,y:2,z:8},{x:0,y:0,z:-0},{x:-8,y:0,z:-8},{x:18,y:25,z:-18});
 for(let phase=0;phase<4;phase++){
  for(const p of points)values.push([world.heightAt(p.x,p.z),world.density(p),world.density({...p,y:p.y+.1}),world.soilAt(p)]);
  if(phase===0)world.apply({id:1,kind:'dig',position:{x:7.9,y:2,z:7.9},radius:1.7,material:'stone',tick:1});
  if(phase===1)world.apply({id:2,kind:'add',shape:'cylinder',surface:'soil',position:{x:7.9,y:2,z:7.9},radius:1.7,material:'stone',tick:2});
  if(phase===2)world.apply({id:3,undo:2,kind:'add',shape:'cylinder',surface:'soil',position:{x:7.9,y:2,z:7.9},radius:1.7,material:'stone',tick:3});
 }
 expect(createHash('sha256').update(JSON.stringify(values)).digest('hex')).toBe(hashes[generator-1][seedIndex]);
});
it('retains a bounded exact numeric height cache across eviction and repeated vertical probes',()=>{
 for(const generator of [1,2,3,4] as const){const world=new SdfWorld({...WORLD,seed:937},generator),height=generator>=3?meadowsHeight:generator===2?landscapeHeight:terrainHeight;
  for(let i=0;i<17000;i++){const x=i/37-230,z=(i%89)/17-3;expect(world.heightAt(x,z)).toBe(height(x,z,937));}
  expect(Reflect.get(world,'heightCount')).toBeLessThanOrEqual(16384);
  const heights=Reflect.get(world,'heights') as Map<number,Map<number,number>>,get=vi.spyOn(heights,'get');
  expect(world.heightAt(1.25,-.75)).toBe(height(1.25,-.75,937));for(let i=0;i<100;i++)expect(world.heightAt(1.25,-.75)).toBe(height(1.25,-.75,937));expect(get).toHaveBeenCalledTimes(1);get.mockRestore();
 }
});
it('invalidates an empty cached edit brick immediately when a neighboring boundary edit arrives',()=>{
 const world=new SdfWorld(),point={x:8,y:2,z:8};const baseline=world.density(point);expect(world.density(point)).toBe(baseline);
 world.apply({id:1,kind:'dig',position:point,radius:1.7,material:'stone',tick:1});expect(world.density(point)).toBe(1.7);
 world.apply({id:2,undo:1,kind:'dig',position:point,radius:1.7,material:'stone',tick:2});expect(world.density(point)).toBe(baseline);
});
