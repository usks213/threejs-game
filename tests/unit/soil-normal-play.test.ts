import {it,expect} from 'vitest';
import {NormalPlayer} from './helpers/normal-campaign-player';
import {captureCampaign,restoreCampaignInto,defaultSettings} from '../../src/prototype/campaign-session';
import {CoreSimulation} from '../../src/prototype/core/simulation';

it('zero-grant normal player gathers soil, crafts/selects a rake, fills a flat step, walks on it, removes it and reloads',()=>{
 const d=new NormalPlayer(),s=d.sim;expect(Object.values(s.survival.inventory).every(n=>n===0)).toBe(true);
 d.walk(-.55,6.15);d.act('chisel');d.harvest(4,12,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25}],'sample-wood');
 d.walk(-.55,5.25);d.walk(-3.45,5.25);d.walk(-3.45,6.35);d.harvest(3,8,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
 d.walk(-3.45,5.25);d.interact('hearth',{x:-3,y:.9,z:4});d.walk(1.6,5.5);
 for(let attempt=0;attempt<5&&s.survival.inventory[2]<9;attempt++){d.look({x:1.6,y:.23,z:4.35});d.act('heavy');d.idle();d.advance(.4);}
 d.walk(1.6,4.8);d.advance(1);expect(s.survival.inventory[2],d.diagnostic('finite soil collected from original ground')).toBeGreaterThanOrEqual(9);
 d.menu('craft','terrain-rake');d.menu('equip','terrain-rake');expect(s.soilFilling).toBe(false);d.walk(1.6,5.8);d.walk(0,6.2);d.look({x:0,y:.25,z:4.85});d.act('element-next');expect(s.soilFilling).toBe(true);
 const preview=s.soilPreview();expect(preview?.ok,d.diagnostic('fill preview '+preview?.message)).toBe(true);const soil=s.survival.inventory[2],target={...preview!.target};d.act('attack');expect(s.survival.inventory[2]).toBe(soil-9);expect(s.survival.soil.snapshot().patches).toHaveLength(1);const tile=s.survival.soil.snapshot().patches[0];
 const placed=captureCampaign(s,defaultSettings()),reload=new CoreSimulation(true,false,true);expect(restoreCampaignInto(reload,placed)).not.toBeNull();expect(reload.survival.soil.snapshot()).toEqual(s.survival.soil.snapshot());expect(reload.arena.field.ray({...target,y:2},{x:0,y:-1,z:0},3)?.point.y).toBeCloseTo(target.y,2);
 d.walk(target.x,target.z);d.advance(.4);expect(s.player.position.y,d.diagnostic('standing on filled ground')).toBeGreaterThan(.45);expect(s.arena.field.overlaps(s.player.position)).toBe(false);
 d.walk(target.x,6.2);d.look(target);d.act('heavy');expect(s.survival.soil.snapshot().patches).toHaveLength(0);expect(s.survival.inventory[2]).toBe(soil);expect([...s.arena.field.ownedLayerSamples(tile.id)]).toHaveLength(0);expect(s.campaign.gearInfo('terrain-rake').durability).toBe(98);
 expect(restoreCampaignInto(reload,captureCampaign(s,defaultSettings()))).not.toBeNull();expect(reload.survival.inventory[2]).toBe(soil);expect(reload.survival.soil.snapshot().patches).toHaveLength(0);d.checkpoint('finite soil fill, real walking, removal and reload');
},60000);
