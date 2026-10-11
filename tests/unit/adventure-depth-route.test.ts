import {it,expect} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
import type {GameAction} from '../../src/game/types';
import type {Vec3} from '../../src/world/types';
it('walks to the eastern chasm, opens the wing, reaches the depth beacon and ascends through solid ground to the surface',()=>{
 const room=new SessionAuthority(),sim=room.sim,aim={x:0,y:0,z:-1},idle={x:0,z:0,jump:false};
 const wait=(n=6)=>{for(let i=0;i<n;i++)room.step(idle);};
 const act=(action:GameAction,id?:string,target?:Vec3)=>{wait();return room.action('host',{type:'game-action',action,id,target,aim});};
 const walk=(x:number,z:number,limit=1000)=>{let last=Infinity,stuck=0;for(let i=0;i<limit;i++){const dx=x-sim.player.x,dz=z-sim.player.z,d=Math.hypot(dx,dz);if(d<.45)return;stuck=d>last-.015?stuck+1:0;last=d;room.step({x:dx/d,z:dz/d,jump:stuck>15&&sim.player.grounded});}throw Error(`Depth route stopped at ${JSON.stringify(sim.player)} on way to ${x},${z}`);};
 walk(5,20);walk(16,20);walk(28,17);walk(28,10);if(!sim.player.grounded)act('glide');for(let i=0;i<700&&sim.player.y>-9;i++)room.step(idle);expect(sim.player.y).toBeLessThan(-9);if(sim.adventure.traversal.gliding)act('glide','off');wait(30);walk(28,8);act('gather','810003');expect(sim.adventure.state.resources.find(n=>n.id===810003)!.ready).toBe(1e10);walk(0,0);act('sky-ascend-preview');act('sky-ascend');expect(sim.player.y).toBeGreaterThan(0);expect(sim.adventure.state.health).toBeGreaterThan(0);
},30000);
