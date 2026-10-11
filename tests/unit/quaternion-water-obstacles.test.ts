import {expect,it} from 'vitest';
import {obstacleContains,voxelizeObstacles,type WaterObstacle} from '../../src/fluid/obstacles';
import {FluidGrid} from '../../src/fluid/fluid';
import {SdfWorld} from '../../src/world/density';
import {global,local,multiply,increment,yawQuaternion} from '../../src/game/skybound/orientation';
const volume=(fluid:FluidGrid)=>[...fluid.cells.values()].reduce((sum,p)=>sum+p.volume,0);
const hull=(q=increment({x:.3,y:.8,z:.5},.7)):WaterObstacle=>({x:.13,y:1.31,z:-.17,hx:.8,hy:.125,hz:1,q});
it('matches collision-space full quaternion box occupancy at all eight fractional probes',()=>{
 const b=hull(),part={position:{x:b.x,y:b.y,z:b.z},rotation:0,q:b.q!},mask=voxelizeObstacles([b],.5);
 for(let x=-1.5;x<=1.5;x+=.5)for(let y=0;y<=2.5;y+=.5)for(let z=-1.5;z<=1.5;z+=.5){let count=0;for(const dx of[.125,.375])for(const dy of[.125,.375])for(const dz of[.125,.375]){const p={x:x+dx,y:y+dy,z:z+dz},v=local(p,part),inside=Math.abs(v.x)<b.hx&&Math.abs(v.y)<b.hy&&Math.abs(v.z)<b.hz;expect(obstacleContains(b,p.x,p.y,p.z)).toBe(inside);count+=Number(inside);}expect(mask.occupied.get(`${x},${y},${z}`)??0).toBe(count/8);}
});
it('keeps a thin tilted hull continuous along every intersecting cell-center edge',()=>{
 const b={...hull(multiply(yawQuaternion(.6),increment({x:0,y:0,z:1},.45))),hy:.01},part={position:{x:b.x,y:b.y,z:b.z},rotation:0,q:b.q!},mask=voxelizeObstacles([b],.5);let crossed=0;
 for(let x=-1.5;x<=1.5;x+=.5)for(let y=0;y<=2.5;y+=.5)for(let z=-1.5;z<=1.5;z+=.5)for(const axis of['x','y','z']as const){const a={x:x+.25,y:y+.25,z:z+.25},end={...a,[axis]:a[axis]+.5},pa=local(a,part),pb=local(end,part);let low=0,high=1;for(const key of['x','y','z']as const){const half=b[key==='x'?'hx':key==='y'?'hy':'hz'],delta=pb[key]-pa[key];if(Math.abs(delta)<1e-8){if(Math.abs(pa[key])>=half)high=-1;}else{const a=(-half-pa[key])/delta,c=(half-pa[key])/delta;low=Math.max(low,Math.min(a,c));high=Math.min(high,Math.max(a,c));}}const hit=low<high&&high>0&&low<1;if(hit){crossed++;const from=`${x},${y},${z}`,to=`${x+(axis==='x'?.5:0)},${y+(axis==='y'?.5:0)},${z+(axis==='z'?.5:0)}`;expect(mask.barriers.has(`${from}/${to}`)).toBe(true);expect(mask.barriers.has(`${to}/${from}`)).toBe(true);}}
 expect(crossed).toBeGreaterThan(5);expect(mask.occupied.size).toBeLessThan(mask.barriers.size);
});
it('takes the union of overlapping hull probes rather than creating extra displaced volume',()=>{
 const b=hull(),one=voxelizeObstacles([b],.5),duplicate=voxelizeObstacles([b,{...b}],.5);expect(duplicate).toEqual(one);
 const shifted={...b,x:b.x+.12},a=voxelizeObstacles([b,shifted],.5),r=voxelizeObstacles([shifted,b],.5);expect([...a.occupied].sort()).toEqual([...r.occupied].sort());expect([...a.barriers].sort()).toEqual([...r.barriers].sort());
});
it('preserves yaw-only masks and validates quaternion hull budgets without silently truncating geometry',()=>{
 const b={x:.1,y:1.2,z:.2,hx:.6,hy:.25,hz:.9,rotation:.4},yaw=voxelizeObstacles([b],.5),q=voxelizeObstacles([{...b,q:yawQuaternion(.4)}],.5);expect([...q.occupied].sort()).toEqual([...yaw.occupied].sort());expect([...q.barriers].sort()).toEqual([...yaw.barriers].sort());
 expect(()=>voxelizeObstacles([{...hull(),q:{x:NaN,y:0,z:0,w:1}}],.5)).toThrow('Invalid');expect(()=>voxelizeObstacles([{...hull(),hx:100,hy:100,hz:100}],.5)).toThrow('budget');
});
it('preserves all water while a quaternion hull translates and tilts',()=>{
 const world=new SdfWorld();world.density=p=>p.y<0?-1:1;const fluid=new FluidGrid(world,.5);
 for(let x=-2;x<2;x+=.5)for(let z=-2;z<2;z+=.5)fluid.add({x,y:.5,z},.12);const initial=volume(fluid);
 for(let tick=0;tick<80;tick++){fluid.setObstacles([{...hull(increment({x:.3,y:.1,z:.2},tick*.03)),x:Math.sin(tick*.08),y:.75}]);fluid.step();expect(volume(fluid)).toBeCloseTo(initial,8);expect([...fluid.cells.values()].every(p=>Number.isFinite(p.volume)&&p.volume>=0)).toBe(true);}
 expect(fluid.displaced).toBeGreaterThan(0);
});
it('does not push water through a static thin wall when a moving hull fills a sealed source cell',()=>{
 const world=new SdfWorld();world.density=p=>p.y<0||p.z<0||p.z>.5||p.x<0?-1:1;const fluid=new FluidGrid(world,.5);
 fluid.add({x:0,y:.5,z:0},.1);const wall:WaterObstacle={x:.5,y:1,z:.25,hx:.025,hy:4,hz:2};
 fluid.setObstacles([{x:.25,y:.75,z:.25,hx:.3,hy:.3,hz:.3,q:yawQuaternion(0)}],[wall]);
 for(let tick=0;tick<4;tick++){fluid.step();expect(volume(fluid)).toBeCloseTo(.1,10);expect([...fluid.cells.values()].some(p=>p.x>=.5)).toBe(false);}
});
