import {it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {executeGameCommand} from '../../src/prototype/campaign-commands';
it('rejects post-death inventory transactions for either actor without spending or reviving',()=>{
 const sim=new CoreSimulation(true,false,true);sim.campaign.state.items.bandage=2;sim.survival.inventory[4]=20;sim.survival.inventory[7]=20;
 const guest=sim.enableCompanion();guest.hp=0;const before=sim.campaign.snapshot(),materials={...sim.survival.inventory};
 sim.withCompanion(()=>{for(const command of [{type:'consume',id:'bandage'},{type:'craft',id:'fishing-rod'},{type:'gear',id:'fishing-rod'},{type:'travel',id:'hearth'}] as const)expect(executeGameCommand(sim,command).ok).toBe(false);});
 expect(guest.hp).toBe(0);expect(sim.campaign.snapshot()).toEqual(before);expect(sim.survival.inventory).toEqual(materials);expect(sim.player.hp).toBe(100);
 sim.player.hp=0;expect(executeGameCommand(sim,{type:'consume',id:'bandage'}).ok).toBe(false);expect(sim.player.hp).toBe(0);expect(sim.campaign.state.items.bandage).toBe(2);
 expect(executeGameCommand(sim,{type:'gear',id:'rescue'}).ok).toBe(true);expect(sim.player.hp).toBeGreaterThan(0);
});
