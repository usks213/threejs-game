import {it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {REGIONS} from '../../src/prototype/core/regions';
import {captureCampaign,hydrateCampaign,defaultSettings} from '../../src/prototype/campaign-session';
const idle={x:0,z:0,sprint:false,block:false,water:false};
function fixture(){const sim=new CoreSimulation(true,false,true);Object.assign(sim.campaign.state,{flameTier:4,gateOpen:true,campUnlocked:true,completed:['ridge'],unlockedRegions:REGIONS.slice(0,6).map(r=>r.id)});sim.player.position={x:-10,y:5.25,z:-50.3};sim.look(0,Math.atan2(1.07,1.7));return sim;}
it('routes a real regional-resource hit through E, depletes its bundle and never duplicates its reward',()=>{
 const sim=fixture(),target=sim.target();expect(target?.hit.cell.object).toBe('rg-rime-crystal');expect(target?.action).toContain('E /');
 expect(sim.elements.damage(target!.hit,1000,0).destroyed).toBe(0);sim.action('interact',idle);expect(sim.survival.inventory[3]).toBe(6);expect(sim.campaign.state.items['rime-heart']).toBe(4);expect(sim.campaign.state.claimedPoints).toContain('rg-rime-crystal');
 expect([...sim.arena.field.objectSamples('rg-rime-crystal')]).toHaveLength(0);sim.action('interact',idle);expect(sim.survival.inventory[3]).toBe(6);
 const restored=hydrateCampaign(captureCampaign(sim,defaultSettings()))!;expect(restored).not.toBeNull();expect(restored.sim.survival.inventory[3]).toBe(6);expect([...restored.sim.arena.field.objectSamples('rg-rime-crystal')]).toHaveLength(0);
});
it('repairs old claimed-but-visible resource geometry without granting materials again',()=>{
 const sim=fixture();expect(sim.campaign.interactRegional('rg-rime-crystal',sim.player.position).ok).toBe(true);expect(sim.arena.objects.get('rg-rime-crystal')!.open).toBe(false);const saved=captureCampaign(sim,defaultSettings());
 const restored=hydrateCampaign(saved)!;expect(restored).not.toBeNull();expect(restored.sim.survival.inventory[3]).toBe(6);expect(restored.sim.campaign.state.items['rime-heart']).toBe(4);expect(restored.sim.arena.objects.get('rg-rime-crystal')!.open).toBe(true);expect([...restored.sim.arena.field.objectSamples('rg-rime-crystal')]).toHaveLength(0);
});
