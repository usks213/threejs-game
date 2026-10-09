import {it,expect} from 'vitest';
import {NormalPlayer} from './helpers/normal-campaign-player';
import {captureCampaign,hydrateCampaign,defaultSettings} from '../../src/prototype/campaign-session';
import {playerBedIntact} from '../../src/prototype/core/player-rest';

it('fresh gathering, forest cache and paid personal bed lead to dawn/dusk rest without resource or clock grants',()=>{
 const d=new NormalPlayer(),s=d.sim;expect(Object.values(s.survival.inventory).every(n=>n===0)).toBe(true);
 d.walk(-.55,6.15);d.act('chisel');d.harvest(4,18,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25}],'sample-wood');
 d.walk(-.55,5.25);d.walk(-3.45,5.25);d.walk(-3.45,6.35);d.harvest(3,6,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
 d.walk(-3.5,5.3);d.interact('hearth',{x:-3,y:.9,z:4});
 for(const [x,z] of [[0,5.3],[0,9.5],[-10,9.5],[-10,-4.5],[-12.4,-4.5]])d.walk(x,z);
 d.interact('forest-chest',{x:-14.1,y:.65,z:-5.1});expect(s.survival.inventory[10]).toBe(4);
 for(const [x,z] of [[-10,-4.5],[-10,9.5],[0,9.5],[0,5.3],[-3.5,5.3]])d.walk(x,z);
 const materials={...s.survival.inventory};d.menu('homestead','furniture:player-bed');expect(s.survival.inventory[4]).toBe(materials[4]-10);expect(s.survival.inventory[10]).toBe(1);expect(playerBedIntact(s.arena.field)).toBe(true);
 d.walk(-1.7,5.15);d.advance(.5);expect(s.startPlayerRest('dusk')).toEqual({ok:true,message:expect.any(String)});const start=s.seconds,hour=s.worldHour;let chunks=0;
 while(s.bedWait.active&&chunks++<550)s.advancePlayerRest();expect(s.bedWait.active).toBe(false);expect(s.worldHour).toBeCloseTo(18,7);expect(s.seconds-start).toBeCloseTo((18-hour)*90,5);expect(s.campaign.state.restSeconds).toBe(240);expect(s.campaign.state.deaths).toBe(0);
 const restored=hydrateCampaign(captureCampaign(s,defaultSettings()));expect(restored).not.toBeNull();expect(restored!.sim.bedWait.active).toBe(false);expect(restored!.sim.campaign.state.restSeconds).toBe(240);expect(playerBedIntact(restored!.sim.arena.field)).toBe(true);d.checkpoint('earned bed and actual dusk wait');
},150000);
