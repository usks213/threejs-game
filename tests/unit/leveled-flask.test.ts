import {it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
const idle={x:0,z:0,sprint:false,block:false,water:false};
it('allows a flask above100HP when earned maximum HP is higher, without over-healing or duplicate consumption',()=>{
 const sim=new CoreSimulation(true,false,true);for(let i=0;i<10;i++)sim.campaign.defeat('fixture-enemy-'+i);expect(sim.campaign.learn('vigor').ok).toBe(true);expect(sim.campaign.maxHp).toBeGreaterThan(110);sim.player.hp=110;sim.player.flasks=1;sim.action('heal',idle);expect(sim.player.phase).toBe('heal');expect(sim.player.flasks).toBe(0);sim.action('heal',idle);expect(sim.player.flasks).toBe(0);for(let i=0;i<60;i++)sim.tick(1/30,idle);expect(sim.player.hp).toBe(sim.campaign.maxHp);expect(sim.player.phase).toBe('idle');
 sim.player.flasks=1;sim.action('heal',idle);expect(sim.player.flasks).toBe(1);expect(sim.player.phase).toBe('idle');
});
