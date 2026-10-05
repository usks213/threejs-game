import {it,expect} from 'vitest';
import {NormalPlayer} from './helpers/normal-campaign-player';
import {playFirstTwoRegions} from './helpers/normal-regional-player';
import {WEST_ROUTES} from '../../src/prototype/core/expedition-west';
import {captureCampaign,hydrateCampaign,defaultSettings} from '../../src/prototype/campaign-session';

function assault(d:NormalPlayer,index:number){
 const s=d.sim,e=s.enemies[index];
 for(let cycle=0;cycle<90&&e.hp>0;cycle++){
  d.idle();d.heal();d.look({...e.position,y:e.position.y+1.2});
  if(s.player.stamina<25){d.advance(2,{x:s.player.position.x<-61?1:-1});continue;}
  // A cornered caster can put a wall in the wide sword arc. Aim through the
  // clear chest ray and use the game's wet-to-lightning reaction instead.
  if(index===21&&s.target(7)?.enemy?.id===index){if(s.combat.mana<20)d.menu('consume','mana-draught');const element=s.enemyElements[index].wet>0?'lightning':'water';while(s.selectedElement!==element)d.act('element-next');d.act('cast');d.until(()=>s.player.phase==='idle',4,{x:.25},'western elemental cast');d.advance(.7,{x:.3});continue;}
  if(Math.hypot(e.position.x-s.player.position.x,e.position.z-s.player.position.z)>1.45){const before={...s.player.position};d.advance(.2,{z:1});if(Math.hypot(s.player.position.x-before.x,s.player.position.z-before.z)<.04)d.advance(.5,{x:1});continue;}
  d.act(s.focus.value>=100?'special':'attack');d.until(()=>s.player.phase==='idle',4,{z:.2},'western assault');
 }
 expect(e.hp,d.diagnostic('western enemy')).toBeLessThanOrEqual(0);
}

function talkResident(d:NormalPlayer,id:string){
 const a=d.sim.westNpcs.get(id)!;expect(a.visible).toBe(true);d.walk(a.position.x+1.35,a.position.z);const xp=d.sim.campaign.state.xp,materials={...d.sim.survival.inventory};d.interact(id,{...a.position,y:a.position.y+1.1});expect(d.sim.target()?.npcId).toBe(id);expect(d.sim.campaign.state.xp).toBe(xp);expect(d.sim.survival.inventory).toEqual(materials);
}

it('rescues both western specialists, talks at their new homes, crafts their gear and restores via normal production actions',()=>{
 const d=new NormalPlayer(true),s=d.sim;playFirstTwoRegions(d,4);expect(s.western!.accessible).toBe(true);d.menu('learn','vigor');d.menu('equip','ember-charm');
 for(const [x,z] of [[0,5.3],[0,9.5],[-10,9.5],[-10,1.9],[-6,1.9]])d.walk(x,z);d.act('chisel');d.harvest(7,32,[{x:-5.75,y:3.4,z:3},{x:-5.4,y:3.5,z:3},{x:-6.1,y:3.5,z:3}],'tree0');d.act('sword');for(const [x,z] of [[-10,1.9],[-10,9.5],[0,9.5],[0,5.3],[-3.5,5.3]])d.walk(x,z);for(let i=0;i<4;i++)d.menu('craft','mana-draught');
 for(let i=0;i<5;i++)d.menu('craft','bandage');for(let i=0;i<5&&s.player.hp<s.campaign.maxHp;i++)d.menu('consume','bandage');
 for(const id of ['iron-blade','hide-coat'])if(s.campaign.repairStatus(id,s.player.position).ok)d.menu('gear','repair:'+id);
 d.menu('craft','berry-meal');d.menu('consume','berry-meal');
 d.walk(-4,7);d.interact('berries-0',{x:-5,y:.8,z:7});d.walk(-4,8.8);d.walk(-7,8.8);d.interact('berries-1',{x:-7,y:.8,z:7});d.walk(-9,8.8);d.interact('berries-2',{x:-9,y:.8,z:7});d.walk(-10,8.8);d.walk(-10,5.3);d.interact('berries-5',{x:-9,y:.8,z:5});d.walk(-3.5,5.3);d.interact('berries-3',{x:-5,y:.8,z:5});for(let i=0;i<6;i++)d.menu('craft','bandage');
 for(const [x,z] of [[0,5.3],[0,9.5],[-10,9.5],[-10,-9],[-16,-9],[-22,-9],[-26,-9],[-27,-6],[-30,-6]])d.walk(x,z);
 d.interact('rg-resin',{x:-32,y:.65,z:-6});for(const p of WEST_ROUTES[0].nodes.slice(1,5))d.walk(p.x,p.z);
 d.fight(18);d.walk(-49.7,-11.5);d.interact('west-hamlet-cache',{x:-50,y:1.1,z:-13});expect(s.western!.snapshot().claimed).toContain('west-hamlet-cache');
 d.walk(-47,-14);d.interact('west-return-hearth',{x:-46.5,y:1.35,z:-16});expect(s.western!.snapshot().campUnlocked).toBe(true);
 d.walk(-45,-15.7);d.walk(-44.65,-16.8);d.interact('west-carpenter',{x:-43.5,y:1.75,z:-17});expect(s.campaign.professionUnlocked('carpenter')).toBe(true);
 d.walk(-47,-14);talkResident(d,'west-carpenter');
 d.walk(-46,-13);for(const p of WEST_ROUTES[0].nodes.slice(5,-1))d.walk(p.x,p.z);
 assault(d,20);d.advance(4);d.heal();d.walk(-63,-40);assault(d,21);d.walk(-63,-43.8);d.interact('west-mine-switch',{x:-63.75,y:5.2,z:-44.3});expect(s.western!.snapshot().gateOpen).toBe(true);
 d.walk(-63,-40);d.interact('west-alchemist',{x:-64.25,y:5.25,z:-40.15});expect(s.campaign.professionUnlocked('alchemist')).toBe(true);
 d.walk(-63,-43);d.walk(-61,-45);d.walk(-58,-43);d.interact('west-mine-cache',{x:-58,y:4.65,z:-45});expect(s.western!.snapshot().claimed).toContain('west-mine-cache');
 d.menu('travel','west-return-hearth');d.walk(-47.2,-14);talkResident(d,'west-alchemist');
 d.walk(-47.2,-14.5);for(const id of ['windwoven-glider','resin-staff']){d.menu('craft',id);d.menu('equip',id);}expect(s.campaign.glideSpeedMultiplier).toBe(1.2);expect(s.campaign.glideStaminaMultiplier).toBe(.75);expect(s.campaign.spellMultiplier).toBeCloseTo(1.4);expect(s.campaign.isStaffWeapon).toBe(true);
 d.walk(-45,-14.5);d.act('jump');d.until(()=>!s.player.grounded,2,{},'specialist glider takeoff');d.act('jump');expect(s.gliding).toBe(true);d.advance(.3);d.act('jump');d.until(()=>s.player.grounded,5,{},'specialist glider landing');
 d.advance(12);for(const a of s.westNpcs.actors){expect(a.visible).toBe(true);expect(a.state?.activity).toMatch(/work|social|rest|shelter|walking|waiting/);expect([...s.arena.field.objectSamples(a.profile.id)]).toHaveLength(0);}expect(s.campaign.state.deaths).toBe(0);const saved=captureCampaign(s,defaultSettings()),restored=hydrateCampaign(JSON.parse(JSON.stringify(saved)));expect(restored).not.toBeNull();expect(restored!.sim.western!.snapshot()).toEqual(s.western!.snapshot());expect(restored!.sim.westNpcs.snapshot()).toEqual(s.westNpcs.snapshot());expect(restored!.sim.campaign.snapshot()).toEqual(s.campaign.snapshot());
 expect(restored!.sim.campaign.professionUnlocked('carpenter')).toBe(true);expect(restored!.sim.campaign.professionUnlocked('alchemist')).toBe(true);expect(restored!.sim.western!.geometryConsistent()).toBe(true);d.checkpoint('two specialists, crafted equipment and restored settlement');
},180000);
