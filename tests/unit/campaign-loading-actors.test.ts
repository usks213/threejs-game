import {it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
it('keeps unloaded actors and dormant summon slots frozen until world residency is ready',()=>{
 const sim=new CoreSimulation(true,true),before=sim.enemies.slice(2).map(e=>({hp:e.hp,position:{...e.position},phase:e.phase}));
 for(let i=0;i<60;i++)sim.tick(1/60,{x:0,z:0,sprint:false,block:false,water:false});
 expect(sim.enemies.slice(2).map(e=>({hp:e.hp,position:{...e.position},phase:e.phase}))).toEqual(before);
 expect(sim.campaign.state.claimedEnemies).toEqual([]);expect(sim.worldReady).toBe(false);
},15000);
