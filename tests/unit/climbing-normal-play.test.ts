import {it,expect} from 'vitest';
import {NormalPlayer} from './helpers/normal-campaign-player';
it('fresh gathering and hearth allow paid workbench→ladder→aimed climb using only production actions',()=>{
 const d=new NormalPlayer(),s=d.sim;expect(Object.values(s.survival.inventory).every(n=>n===0)).toBe(true);
 d.walk(-.55,6.15);d.act('chisel');d.harvest(4,24,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25},{x:-2.2,y:.58,z:6.95}],'sample-wood');
 d.walk(-.55,5.25);d.walk(-3.45,5.25);d.walk(-3.45,6.35);d.harvest(3,6,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');d.walk(-3.45,5.3);d.interact('hearth',{x:-3,y:.9,z:4});expect(s.campaign.state.flameTier).toBe(1);
 d.walk(0,6);d.act('build');d.look({x:-1.5,y:.27,z:4.9});expect(s.buildPreview()?.ok,d.diagnostic('workbench placement')).toBe(true);d.act('build');expect(s.survival.exportState().buildings[0].recipe).toBe('workbench');
 for(let i=0;i<7;i++)d.act('recipe-next');expect(s.selectedRecipe).toBe('ladder');d.look({x:.2,y:.27,z:4.7});expect(s.buildPreview()?.ok,d.diagnostic('ladder placement')).toBe(true);const wood=s.survival.inventory[4];d.act('build');expect(s.survival.inventory[4]).toBe(wood-6);d.act('cast');const ladder=s.survival.exportState().buildings.find(b=>b.recipe==='ladder')!;
 d.walk(ladder.position.x,ladder.position.z+.7);d.interact(ladder.id,{x:ladder.position.x,y:ladder.position.y+1.5,z:ladder.position.z});expect(s.ladders.active(s.player)).toBe(true);const start=s.player.position.y;d.advance(1.3,{z:1});expect(s.player.position.y).toBeGreaterThan(start+1.4);d.act('jump');expect(s.ladders.active(s.player)).toBe(false);d.advance(.5,{z:-1});d.until(()=>s.player.grounded,4);expect(s.player.hp).toBeGreaterThan(0);expect(s.campaign.state.deaths).toBe(0);
},20000);
