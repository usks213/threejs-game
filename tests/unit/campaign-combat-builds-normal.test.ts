import {describe,it,expect} from 'vitest';
import {NormalPlayer} from './helpers/normal-campaign-player';
import type {Element} from '../../src/prototype/core/elements';
function prepare(d:NormalPlayer){
 d.walk(-.55,6.15);d.act('chisel');d.harvest(4,24,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25},{x:-2.2,y:.58,z:6.95}],'sample-wood');
 d.walk(-.55,5.25);d.walk(-3.45,5.25);d.walk(-3.45,6.35);d.harvest(3,18,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
 d.walk(-3.45,6.65);d.harvest(7,20,[{x:-3.45,y:.5,z:7.9},{x:-3.1,y:.5,z:7.9},{x:-3.8,y:.5,z:7.9}],'sample-grass');d.walk(-3.45,5.3);d.walk(2.5,5.3);d.walk(2.5,5.75);d.harvest(6,4,[{x:2.5,y:.8,z:7.1},{x:2.8,y:.8,z:7.1},{x:2.2,y:.8,z:7.1}],'sample-metal');d.walk(2.5,5.3);d.walk(-3.5,5.3);d.interact('hearth',{x:-3,y:.9,z:4});
}
function choose(d:NormalPlayer,element:Element){for(let i=0;i<5&&d.sim.selectedElement!==element;i++)d.act('element-next');expect(d.sim.selectedElement).toBe(element);}
function shieldCounter(d:NormalPlayer,index:number,build:'bow'|'staff'){
 const s=d.sim,e=s.enemies[index];for(let round=0;round<28&&e.hp>0;round++){
  d.idle();d.heal();d.look({...e.position,y:e.position.y+1.35});if(s.player.stamina<35){d.advance(2.2,{x:s.player.position.x>1?-1:1});continue;}
  d.until(()=>['recover','stagger','dead'].includes(e.phase),12,{block:true},build+' safe counter opening');if(e.hp<=0)break;
  for(const height of [1.35,.95,.55,1.65]){d.look({...e.position,y:e.position.y+height});if(s.target(7)?.enemy?.id===index)break;}expect(s.target(7)?.enemy?.id,d.diagnostic('reticle on remaining enemy voxels')).toBe(index);
  if(build==='bow')d.act('attack');else{if(s.combat.mana<20)d.menu('consume','mana-draught');choose(d,round%3===0?'water':'lightning');d.act('cast');}d.idle();if(build==='staff')d.advance(1.35);
 }expect(e.hp,d.diagnostic(build+' defeats '+index)).toBeLessThanOrEqual(0);
}
describe('fresh finite-resource combat builds through the first core boss',()=>{
 for(const build of ['bow','staff'] as const)it(build+' uses production harvesting, crafting, equipment and real ranged/elemental contacts',()=>{
  const d=new NormalPlayer(),s=d.sim;prepare(d);d.menu('craft',build);d.menu('equip',build);if(build==='bow')for(let i=0;i<3;i++)d.menu('craft','arrows');if(build==='staff')for(let i=0;i<8;i++)d.menu('craft','mana-draught');d.act('sword');
  d.walk(0,5.3);d.walk(0,3.2);d.interact('door',{x:0,y:1.4,z:1});shieldCounter(d,0,build);d.heal();d.walk(0,0);d.walk(-2.4,-1.8);d.interact('artisan',{x:-2.5,y:1.1,z:-3.5});expect(s.campaign.state.artisanRescued).toBe(true);d.menu('craft','bandage');d.walk(0,0);d.walk(0,3.2);shieldCounter(d,1,build);
  expect(s.campaign.has('warden-core')).toBe(true);expect(s.campaign.state.deaths).toBe(0);expect(s.player.hp).toBeGreaterThan(0);expect(s.campaign.equippedWeapon).toBe(build);if(build==='bow')expect(s.campaign.state.items.arrows).toBeLessThan(24);else{expect(s.enemyElements[1].scars.length).toBeGreaterThan(0);expect(s.campaign.state.items['mana-draught']).toBeLessThan(8);expect(s.combat.mana).toBeLessThan(100);}d.checkpoint(build+' core boss');
 },30000);
});
