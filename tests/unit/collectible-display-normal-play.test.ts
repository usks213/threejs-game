import {it,expect} from 'vitest';
import {NormalPlayer} from './helpers/normal-campaign-player';
import {captureCampaign,restoreCampaignInto,defaultSettings} from '../../src/prototype/campaign-session';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {DISPLAY_ITEM} from '../../src/prototype/core/collectible-display';
it('earns every material normally, lights hearth, crafts and displays a dagger, reloads and retrieves the same item',()=>{
 const d=new NormalPlayer(),s=d.sim;expect(Object.values(s.survival.inventory).every(n=>n===0)).toBe(true);
 d.walk(-.55,6.15);d.act('chisel');d.harvest(4,16,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25}],'sample-wood');
 d.walk(-.55,5.25);d.walk(-3.45,5.25);d.walk(-3.45,6.35);d.harvest(3,12,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
 d.walk(-3.5,5.3);d.interact('hearth',{x:-3,y:.9,z:4});d.menu('craft','dagger');const before={...s.survival.inventory};d.menu('homestead','display-build');expect(s.survival.inventory[4]).toBe(before[4]-4);expect(s.survival.inventory[3]).toBe(before[3]-3);d.menu('homestead','display-deposit:dagger');expect(s.campaign.state.items.dagger).toBe(0);expect(s.home.state.storage.items.dagger).toBe(1);expect(s.campaign.craft('dagger',s.player.position).ok).toBe(false);
 d.walk(0,5.3);d.walk(0,4.1);d.look({x:-1.125,y:1.875,z:2.375});expect(s.target()?.hit.cell.object,d.diagnostic('display aim '+JSON.stringify(s.target()))).toBe(DISPLAY_ITEM);expect(s.target()?.label).toContain('短剣');
 const saved=captureCampaign(s,defaultSettings()),restored=new CoreSimulation(true,false,true);expect(restoreCampaignInto(restored,saved)).not.toBeNull();expect(restored.display.snapshot()).toEqual(s.display.snapshot());expect(restored.display.withdraw(restored.displayContext).ok).toBe(true);expect(restored.display.withdraw(restored.displayContext).ok).toBe(false);expect(restored.campaign.state.items.dagger).toBe(1);expect(restored.campaign.gearInfo('dagger').durability).toBe(100);expect(restored.display.remove(restored.displayContext).ok).toBe(true);expect(restored.survival.inventory).toEqual(before);expect(s.campaign.state.deaths).toBe(0);
},45000);
