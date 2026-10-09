import {it,expect} from 'vitest';
import {NormalPlayer} from './helpers/normal-campaign-player';
import {captureCampaign,restoreCampaignInto,defaultSettings} from '../../src/prototype/campaign-session';
import {CoreSimulation} from '../../src/prototype/core/simulation';

it('new player gathers finite materials, independently crafts and uses axe/pick/rake/hammer, then saves selected equipment',()=>{
 const d=new NormalPlayer(),s=d.sim;
 d.walk(-.55,6.15);d.act('chisel');d.harvest(4,12,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25}],'sample-wood');
 d.walk(-.55,5.25);d.walk(-3.45,5.25);d.walk(-3.45,6.35);d.harvest(3,18,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
 d.menu('craft','wood-axe');d.menu('craft','stone-pick');d.menu('equip','stone-pick');expect(s.player.tool).toBe(true);
 d.walk(-3.45,5.25);d.walk(2.5,5.25);d.walk(2.5,5.75);d.harvest(6,4,[{x:2.5,y:.8,z:7.1},{x:2.8,y:.8,z:7.1},{x:2.2,y:.8,z:7.1}],'sample-metal');expect(s.campaign.gearInfo('stone-pick').durability).toBeLessThan(100);
 d.walk(2.5,5.25);d.walk(-.55,5.25);d.walk(-.55,6.15);d.menu('equip','wood-axe');d.harvest(4,20,[{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25},{x:-2.2,y:.58,z:6.95}],'sample-wood');expect(s.campaign.gearInfo('wood-axe').durability).toBeLessThan(100);d.menu('gear','unequip:tool');d.act('chisel');d.walk(-.55,5.3);d.walk(-1.8,5.3);d.walk(-1.8,5.6);d.advance(2);d.harvest(4,40,[{x:-2.2,y:.58,z:6.25},{x:-2.2,y:.58,z:6.95},{x:-2.7,y:.58,z:6.95}],'sample-wood');
 d.menu('craft','terrain-rake');d.menu('craft','build-hammer');d.menu('craft','dagger');d.menu('equip','terrain-rake');
 // A real visible ground contact. Low samples are retained by the leveling plane.
 d.walk(-1.8,5.3);d.walk(0,5.3);d.look({x:0,y:.15,z:4.2});const revision=s.arena.field.revision;d.act('heavy');d.idle();expect(s.arena.field.revision).toBeGreaterThan(revision);expect(s.campaign.gearInfo('terrain-rake').durability).toBe(99);
 d.walk(-3.5,5.3);d.interact('hearth',{x:-3,y:.9,z:4});d.menu('equip','build-hammer');expect(s.buildMode).toBe(true);
 d.walk(0,6);d.look({x:-1.5,y:.27,z:4.9});const preview=s.buildPreview();expect(preview?.ok,d.diagnostic('hammer placement: '+preview?.message)).toBe(true);const wood=s.survival.inventory[4];d.act('attack');d.tick();expect(s.survival.inventory[4]).toBe(wood-8);expect(s.survival.exportState().buildings.some(b=>b.recipe==='workbench')).toBe(true);expect(s.campaign.gearInfo('build-hammer').durability).toBe(99);
 const saved=captureCampaign(s,defaultSettings()),restored=new CoreSimulation(true,false,true);expect(restoreCampaignInto(restored,saved)).not.toBeNull();expect(restored.campaign.state.equipment.tool).toBe('build-hammer');expect(restored.campaign.gearInfo('stone-pick')).toEqual(s.campaign.gearInfo('stone-pick'));expect(restored.survival.inventory).toEqual(s.survival.inventory);expect(restored.campaign.has('dagger')).toBe(true);d.checkpoint('crafted tools and equipment saved');
},45000);
