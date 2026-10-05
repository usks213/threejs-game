import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {CoreSimulation,type Controls} from '../../src/prototype/core/simulation';
import {WEST_SPECIALISTS} from '../../src/prototype/core/expedition-west';
import {WEST_RUNTIME_ENEMIES} from '../../src/prototype/core/expedition-west-integration';
import {WEST_NPC_PROFILES,validWesternNpcLifeState} from '../../src/prototype/core/western-npc-life';
import {createNpcLifeState,npcBody,type NpcLife} from '../../src/prototype/core/npc-life';
import {createNpcLifeView} from '../../src/prototype/rendering/npc-life-view';
import {captureGameFrame,applyGameFrame,validGameFrame} from '../../src/prototype/network/game-frame';
import {campaignSnapshot} from '../../src/prototype/campaign-presenter';
import {defaultSettings} from '../../src/prototype/campaign-session';
import {executeGameCommand} from '../../src/prototype/campaign-commands';
const neutral:Controls={x:0,z:0,sprint:false,block:false,water:false};
const flat=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
/** Explicit seeded fixture for isolation, not normal-play completion evidence. */
function setup(){
 const s=new CoreSimulation(true,false,true,true),west=s.western!;Object.assign(s.campaign.state,{flameTier:2,artisanRescued:true,gateOpen:true,campUnlocked:true,unlockedRegions:['hearthfield','resinwood'],completed:['ridge']});
 for(const enemy of s.enemies){enemy.hp=0;enemy.phase='dead';}s.player.position={x:-45,y:.77,z:-15};
 const claim=(id:string)=>{const p=west.pointPosition(id)!,mine=id==='west-mine-switch'||id==='west-alchemist';const result=west.interact(id,{authority:'host',alive:true,position:{x:p.x+(mine?.9:0),y:p.y+.1,z:p.z+(mine?0:1.15)}});expect(result.ok,result.message).toBe(true);s.reconcileNpc();};
 for(const e of WEST_RUNTIME_ENEMIES)expect(west.defeat(e.key,{slot:e.slot,hp:0},{authority:'host',alive:true,position:s.player.position}).ok).toBe(true);
 for(const id of ['west-hamlet-cache','west-return-hearth','west-mine-switch','west-carpenter','west-alchemist'])claim(id);
 return s;
}
function advance(s:CoreSimulation,hour:number,seconds=20,rain=false){s.worldHour=hour;for(let i=0;i<seconds*30;i++)s.westNpcs.tick(1/30,a=>({...s.npcContextFor(a),rain}));}
function face(s:CoreSimulation,actor:NpcLife){s.player.yaw=Math.atan2(s.player.position.x-actor.position.x,s.player.position.z-actor.position.z);s.player.pitch=Math.atan2(actor.position.y+1.1-s.eye().y,flat(actor.position,s.player.position));}

describe('seeded western specialist daily-life runtime',()=>{
 it('walks independently to distinct actual work and social positions without modifying the world',()=>{
  const s=setup(),revision=s.arena.field.revision,original=s.westNpcs.actors.map(a=>({...a.position}));advance(s,10);
  for(const [i,a] of s.westNpcs.actors.entries()){expect(a.state?.activity,a.profile.id+JSON.stringify(a.state)).toBe('work');expect(flat(a.position,a.profile.work)).toBeLessThan(.09);expect(flat(a.position,original[i])).toBeGreaterThan(.6);expect(a.overlapsTerrain(s.arena.field)).toBe(false);}
  s.worldHour=12;for(let i=0;i<600;i++){const before=s.westNpcs.actors.map(a=>({...a.position}));s.westNpcs.tick(1/30,a=>({...s.npcContextFor(a),rain:false}));for(const [j,a] of s.westNpcs.actors.entries()){expect(flat(before[j],a.position)).toBeLessThanOrEqual(.8/30+1e-8);expect(a.overlapsTerrain(s.arena.field)).toBe(false);}expect(flat(s.westNpcs.actors[0].position,s.westNpcs.actors[1].position)).toBeGreaterThanOrEqual(.879);}
  const ui=campaignSnapshot(s,defaultSettings(),{available:false,label:'',status:''},[],false);for(const a of s.westNpcs.actors){expect(a.state?.activity).toBe('social');expect(ui.points.find(p=>p.id===a.profile.id)?.position).toEqual(a.position);expect(ui.homestead?.find(p=>p.id===a.profile.id)?.reason).toContain(a.label);}expect(s.arena.field.revision).toBe(revision);expect(validWesternNpcLifeState(s.westNpcs.snapshot())).toBe(true);
 });
 it('uses separate built beds with real shelter, and loses sleep when the bed is removed',()=>{
  const s=setup();advance(s,12);s.player.position={x:-47.2,y:.77,z:-14.5};s.survival.inventory[4]=30;s.survival.inventory[10]=15;
  for(const p of WEST_NPC_PROFILES){const result=executeGameCommand(s,{type:'homestead',id:'furniture:'+p.bedFurniture});expect(result.ok,result.message).toBe(true);}advance(s,23,25);
  for(const a of s.westNpcs.actors){expect(a.state?.activity,a.profile.id+JSON.stringify(a.state)).toBe('sleep');expect(flat(a.position,a.profile.bed)).toBeLessThan(.09);expect(a.position.y).toBeGreaterThan(1.1);expect(a.overlapsTerrain(s.arena.field)).toBe(false);}
  const removed=s.westNpcs.actors[0];s.arena.field.removeObject(removed.profile.bedObject);advance(s,23);expect(removed.state?.activity).toBe('rest');expect(s.westNpcs.actors[1].state?.activity).toBe('sleep');advance(s,12,25,true);for(const a of s.westNpcs.actors)expect(a.state?.activity).toBe('shelter');
 });
 it('keeps current-position dialogue and owner-specific ray identity protected, with no duplicate rewards',()=>{
  const s=setup();advance(s,12);const campaign=s.campaign.snapshot(),materials={...s.survival.inventory};
  for(const a of s.westNpcs.actors){s.player.position={x:a.position.x+1.3,y:.77,z:a.position.z};face(s,a);expect(s.target()?.npcId).toBe(a.profile.id);expect(s.target()?.hit.cell.object).toBe(a.profile.id);expect(s.western!.pointPosition(a.profile.id)).toEqual(a.position);for(let i=0;i<4;i++)s.action('interact',neutral);expect(s.events.at(-1)?.text).toContain(a.profile.name.slice(-2)+'「');const state=a.snapshot(),field=s.arena.field.revision;s.action('cast',neutral);expect(a.snapshot()).toEqual(state);expect(s.arena.field.revision).toBe(field);
   const original=WEST_SPECIALISTS.find(p=>p.id===a.profile.id)!;expect(s.western!.interact(a.profile.id,{authority:'host',alive:true,position:{...original.position}}).ok).toBe(false);
  }expect(s.campaign.snapshot()).toEqual(campaign);expect(s.survival.inventory).toEqual(materials);
  for(const profile of WEST_NPC_PROFILES){const body=npcBody('work-a',profile);expect([...body.field.cells.values()].every(c=>c.object===profile.id)).toBe(true);expect(body).not.toBe(npcBody('work-a'));}
 });
 it('rejects occupied-bed placement before payment, keeps forging available while residents sleep',()=>{
  const s=setup(),a=s.westNpcs.actors[0];s.player.position={x:-47.2,y:.77,z:-14.5};s.survival.inventory[4]=40;s.survival.inventory[10]=40;s.campaign.state.items['amber-resin']=8;s.campaign.state.items['singing-copper']=4;s.survival.inventory[3]=20;
  const state=createNpcLifeState(a.profile);state.position={...a.profile.bed,y:.77};a.restore(state);const materials={...s.survival.inventory};expect(executeGameCommand(s,{type:'homestead',id:'furniture:'+a.profile.bedFurniture}).ok).toBe(false);expect(s.survival.inventory).toEqual(materials);expect(s.home.state.furniture).not.toContain(a.profile.bedFurniture);a.state!.activity='sleep';expect(executeGameCommand(s,{type:'craft',id:'windwoven-glider'}).ok).toBe(true);expect(executeGameCommand(s,{type:'craft',id:'resin-staff'}).ok).toBe(true);
 });
 it('does not place a remote bed through either player, a living enemy or an animal',()=>{
  const s=setup();advance(s,12);s.player.position={x:-47.2,y:.77,z:-14.5};s.survival.inventory[4]=30;s.survival.inventory[10]=15;s.enableCompanion();const a=s.westNpcs.actors[0],bed={...a.profile.bed,y:.77},before={...s.survival.inventory},revision=s.arena.field.revision;
  s.companion!.position={...bed};expect(executeGameCommand(s,{type:'homestead',id:'furniture:'+a.profile.bedFurniture}).ok).toBe(false);expect(s.survival.inventory).toEqual(before);expect(s.arena.field.revision).toBe(revision);s.companion!.position={x:-44,y:.77,z:-12};
  s.player.position={...bed};expect(s.furnitureBlocked(a.profile.bedFurniture)).toBe(true);s.player.position={x:-47.2,y:.77,z:-14.5};const enemy=s.enemies[0];enemy.position={...bed};enemy.hp=10;expect(s.furnitureBlocked(a.profile.bedFurniture)).toBe(true);enemy.hp=0;
  s.animal.state.position={...bed};expect(s.furnitureBlocked(a.profile.bedFurniture)).toBe(true);expect(s.survival.inventory).toEqual(before);expect(s.home.state.furniture).not.toContain(a.profile.bedFurniture);
 });
 it('blocks new player overlaps but allows separating escape after a landing, without crossing terrain',()=>{
  const s=setup();advance(s,12);const a=s.westNpcs.actors[0];s.player.position={...a.position,y:3};for(let i=0;i<120;i++)s.tick(1/60,neutral);const start={...s.player.position};for(let i=0;i<150;i++)s.tick(1/60,{...neutral,x:1});expect(flat(s.player.position,start)).toBeGreaterThan(.75);expect(s.arena.field.overlaps(s.player.position)).toBe(false);expect(a.overlaps(s.player.position)).toBe(false);
  s.player.position={x:a.position.x+.9,y:a.position.y,z:a.position.z};a.state!.activity='talking';a.state!.talkSeconds=4;s.player.yaw=0;for(let i=0;i<30;i++)s.tick(1/60,{...neutral,x:-1});expect(a.overlaps(s.player.position)).toBe(false);
 });
 it('waits behind a new solid wall instead of teleporting, then resumes when a safe passage reopens',()=>{
  const s=setup();advance(s,10);s.arena.field.box({x:-47.95,y:.7,z:-16},{x:-47.75,y:3.5,z:-9},4,'build:west-life-wall');const before=s.westNpcs.actors.map(a=>({...a.position}));advance(s,12,12);for(const [i,a] of s.westNpcs.actors.entries()){expect(a.state?.activity).toBe('waiting');expect(a.state?.recovery).toBe('none');expect(flat(a.position,before[i])).toBeLessThan(.1);expect(a.overlapsTerrain(s.arena.field)).toBe(false);}s.arena.field.removeObject('build:west-life-wall');advance(s,12);for(const a of s.westNpcs.actors)expect(a.state?.activity).toBe('social');
 });
 it('replicates host movement without guest ticking or resources, validates bounds and keeps cached views distinct',()=>{
  const host=setup();advance(host,12);host.enableCompanion();const frame=captureGameFrame(host),guest=new CoreSimulation(true,false,true,true),before=guest.campaign.snapshot();expect(validGameFrame(frame,22)).toBe(true);expect(validGameFrame(frame,18)).toBe(false);expect(applyGameFrame(guest,frame)).not.toBeNull();expect(guest.westNpcs.snapshot()).toEqual(host.westNpcs.snapshot());expect(guest.campaign.snapshot()).toEqual({...before,shroudSeconds:frame.guest!.aux.shroudSeconds});for(const a of guest.westNpcs.actors)expect([...guest.arena.field.objectSamples(a.profile.id)]).toHaveLength(0);
  frame.westernNpcLife!.actors['west-carpenter']!.position.x=-100;expect(validGameFrame(frame,22)).toBe(false);expect(guest.westNpcs.actors[0].position.x).not.toBe(-100);
  const scene=new THREE.Scene(),view=createNpcLifeView(scene,host);view.update();expect(scene.children.filter(m=>m.visible).map(m=>m.name)).toContain('west-carpenter-life:social-a');expect(scene.children.filter(m=>m.visible).map(m=>m.name)).toContain('west-alchemist-life:social-a');const count=scene.children.length;view.update();expect(scene.children).toHaveLength(count);view.dispose();view.dispose();expect(scene.children).toHaveLength(0);
 });
});
