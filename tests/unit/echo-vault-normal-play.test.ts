import {it,expect} from 'vitest';
import {NormalPlayer} from './helpers/normal-campaign-player';
import {VAULT_KEY,VAULT_REWARD} from '../../src/prototype/core/echo-vault';
import {captureCampaign,defaultSettings,hydrateCampaign} from '../../src/prototype/campaign-session';

it.each([[7.5,11.35],[7.05,11.06]])('walks from empty inventory and mines the actual key ray from (%s,%s), clears the vault and restores once',(miningX,miningZ)=>{
 const d=new NormalPlayer(),s=d.sim;expect(Object.values(s.survival.inventory).every(n=>n===0)).toBe(true);expect(s.campaign.state.flameTier).toBe(0);
 d.walk(8.5,6);d.walk(8.5,9);d.interact('vault-note',{x:6.5,y:1,z:9});expect(s.dungeon.snapshot().clue).toBe(true);
 d.walk(8.5,11.35);d.walk(miningX,miningZ);d.act('chisel');
 for(let i=0;i<16;i++){
  const mined=s.dungeon.crustMined();d.look(mined?{x:6.5,y:1,z:11.95}:{x:6.5,y:.95,z:11.4});if(mined&&s.target(2.5)?.hit.cell.object==='vault-key')break;expect(s.target(2.5)?.hit.cell.object,d.diagnostic('mine vault crust')).toBe('vault-crust');d.act('heavy');d.idle();d.advance(.4);
 }
 expect(s.dungeon.crustMined()).toBe(true);d.look({x:6.5,y:1,z:11.95});expect(s.target(2.5)?.hit.cell.object).toBe('vault-key');
 d.interact('vault-key',{x:6.5,y:1,z:11.95});expect(s.campaign.state.items[VAULT_KEY],d.diagnostic('key claim')).toBe(1);
 const hp=s.player.hp;d.walk(8.5,11.35);d.walk(10,11.35);d.interact('vault-brake',{x:10.6,y:1,z:12.1});expect(s.dungeon.snapshot().disarmed).toBe(true);
 // The key is necessary and the unchanged gate has real blocking samples.
 expect(s.arena.field.overlaps({x:8.5,y:.3,z:15.25})).toBe(true);
 d.walk(10,13.6);d.interact('vault-switch',{x:10.6,y:1,z:14.4});expect(s.dungeon.snapshot().gateOpen).toBe(true);expect(s.campaign.state.items[VAULT_KEY]).toBe(0);
 expect(s.arena.field.overlaps({x:8.5,y:.3,z:15.25})).toBe(false);
 d.walk(8.5,13.6);d.walk(8.5,16.2);d.interact('vault-cache',{x:8.5,y:.7,z:17.8});expect(s.campaign.state.items[VAULT_REWARD]).toBe(1);
 d.walk(8.5,13.6);d.walk(10,13.6);d.walk(10,11.35);d.walk(8.5,11.35);d.walk(8.5,9);d.walk(8.5,6);d.walk(0,6);
 expect(s.player.hp).toBe(hp);expect(s.campaign.state.deaths).toBe(0);expect(s.survival.inventory[3]).toBeGreaterThan(0);
 const saved=captureCampaign(s,defaultSettings()),restored=hydrateCampaign(JSON.parse(JSON.stringify(saved)));expect(restored).not.toBeNull();expect(restored!.sim.dungeon.snapshot()).toEqual(s.dungeon.snapshot());expect(restored!.sim.campaign.state.items[VAULT_REWARD]).toBe(1);
 d.checkpoint('seal-vault normal mining and return');
},180000);
