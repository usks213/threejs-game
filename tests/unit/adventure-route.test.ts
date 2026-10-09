import {it,expect} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
import type {GameAction} from '../../src/game/types';
import type {Vec3} from '../../src/world/types';
it('walks from the real starting supplies through construction and the causeway to the first sky beacon',()=>{
 const room=new SessionAuthority(),sim=room.sim,aim={x:0,y:0,z:-1},idle={x:0,z:0,jump:false};
 const wait=(n=6)=>{for(let i=0;i<n;i++)room.step(idle);};
 const act=(action:GameAction,id?:string,target?:Vec3)=>{wait();return room.action('host',{type:'game-action',action,id,target,aim});};
 const walk=(x:number,z:number,limit=1000)=>{let last=Infinity,stuck=0;for(let i=0;i<limit;i++){const dx=x-sim.player.x,dz=z-sim.player.z,d=Math.hypot(dx,dz);if(d<.45)return;if(d>last-.015)stuck++;else stuck=0;last=d;room.step({x:dx/d,z:dz/d,jump:stuck>15&&sim.player.grounded});}throw Error(`Route stopped at ${JSON.stringify(sim.player)} on way to ${x},${z}`);};
 const wood=sim.adventure.state.resources.find(n=>n.drop&&n.kind==='wood')!;act('gather',String(wood.id));expect(sim.adventure.state.inventory.wood).toBe(12);
 const y=sim.player.y+1;act('sky-part','beam:wood',{x:3,y,z:6});act('sky-part','beam:wood',{x:5,y,z:6});const [a,b]=sim.skybound.state.parts;act('sky-grab',String(a.id));act('sky-glue',`${a.id}:${b.id}`);act('sky-release',String(a.id));
 walk(0,5);act('gather','810001');expect(sim.adventure.state.resources.find(n=>n.id===810001)!.ready).toBe(1e10);
 walk(7,20);walk(10,20);walk(10,-18);expect(sim.player.y).toBeGreaterThan(17);act('sky-ascend-preview');act('sky-ascend');expect(sim.player.y).toBeGreaterThan(24.9);walk(15,-18);act('gather','810002');expect(sim.adventure.state.resources.find(n=>n.id===810002)!.ready).toBe(1e10);
},30000);
