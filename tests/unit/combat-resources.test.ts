import {describe,it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {createCombatResources,validCombatResources,combatReadout} from '../../src/prototype/core/combat-resources';
import {captureCampaign,defaultSettings,restoreCampaignInto,isCampaignSave} from '../../src/prototype/campaign-session';
import {captureGameFrame,applyGameFrame,validGameFrame} from '../../src/prototype/network/game-frame';
import {captureSharedCampaign,applySharedCampaign} from '../../src/prototype/campaign-network-state';
import {executeGameCommand} from '../../src/prototype/campaign-commands';
const idle={x:0,z:0,sprint:false,block:false,water:false};
const tick=(s:CoreSimulation,t:number)=>{for(let i=0;i<Math.round(t*60);i++)s.tick(1/60,idle);};
function aim(s:CoreSimulation,p:{x:number;y:number;z:number}){const e=s.eye();s.player.yaw=Math.atan2(-(p.x-e.x),-(p.z-e.z));s.player.pitch=Math.atan2(p.y-e.y,Math.hypot(p.x-e.x,p.z-e.z));}
function setup(){const s=new CoreSimulation(true,false,true);aim(s,{x:-1.7,y:.58,z:6.25});return s;}
describe('finite combat resources and authoritative transitions',()=>{
 it('lets a held shield engage after a committed sword swing without cancelling its hit',()=>{
  const s=new CoreSimulation();s.player.position={x:0,y:.25,z:-4};s.enemies[1].hp=0;
  s.action('attack',idle);expect(s.player.phase).toBe('windup');expect(s.player.stamina).toBe(80);
  for(let i=0;i<90;i++)s.tick(1/60,{...idle,block:true});
  expect(s.enemies[0].hp).toBeLessThan(100);expect(s.player.phase).toBe('idle');expect(s.player.guard).toBeGreaterThan(.5);
 });
 it('holds shield through the committed spell interval and activates guard after resolution',()=>{
  const s=setup();s.action('cast',idle);expect(s.combat.mana).toBe(80);
  for(let i=0;i<60;i++)s.tick(1/60,{...idle,block:true});
  expect(s.combat.pending).toBeNull();expect(s.combat.mana).toBe(80);expect([...s.elements.states.values()].some(v=>v.fire>0)).toBe(true);
  expect(s.player.phase).toBe('idle');expect(s.player.guard).toBeGreaterThan(.5);
 });

 it('charges without spending stamina or damaging, rejects an early release, bounds the hold and uses the real overhead sweep',()=>{
  const s=new CoreSimulation(),e=s.enemies[0];s.player.position={x:0,y:.25,z:-4};s.enemies[1].hp=0;
  s.action('heavy-start',idle);tick(s,.2);expect(s.player.stamina).toBe(100);expect(e.hp).toBe(100);s.action('heavy-release',idle);expect(s.player.phase).toBe('idle');
  s.player.position={x:0,y:.25,z:6};s.action('heavy-start',idle);tick(s,2);expect(s.combat.charge).toBe(1.5);expect(combatReadout(s.combat,false)).toContain('準備完了');s.action('cancel-combat',idle);s.action('heavy-release',idle);expect(s.player.phase).toBe('idle');
  s.player.position={x:0,y:.25,z:-4};s.action('heavy-start',idle);tick(s,.45);const chargedPose=s.pose();s.action('heavy-release',idle);expect(s.pose()).toEqual(chargedPose);expect(s.player.phase).toBe('windup');expect(s.player.stamina).toBe(68);tick(s,.15);expect(e.hp).toBe(100);tick(s,.8);expect(e.hp).toBeLessThan(100);
 });
 it('only resolves spells after the visible interval, spends mana once, and cancellation cannot refund or replay',()=>{
  const s=setup(),before=s.arena.field.revision;s.action('cast',idle);expect(s.combat.mana).toBe(80);expect(combatReadout(s.combat,false)).toContain('詠唱 0.5秒');s.action('cast',idle);expect(s.combat.mana).toBe(80);tick(s,.3);expect(s.arena.field.revision).toBe(before);expect(s.elements.states.size).toBe(0);s.action('cancel-combat',idle);tick(s,.8);expect(s.elements.states.size).toBe(0);expect(s.combat.mana).toBe(80);
  s.action('cast',idle);tick(s,.45);expect([...s.elements.states.values()].some(v=>v.fire>0)).toBe(true);expect(s.combat.mana).toBe(60);expect(s.combat.pending).toBeNull();
 });
 it('rechecks SDF cover at release rather than damaging a stale target',()=>{
  const s=setup();s.action('cast',idle);s.arena.field.box({x:-.65,y:.25,z:5.5},{x:-.4,y:2.4,z:7},3,'cast-cover');tick(s,.6);expect([...s.elements.states.values()].some(v=>v.fire>0)).toBe(false);expect(s.combat.mana).toBe(80);
 });
 it('physical damage cancels a committed spell without inventing mana',()=>{
  const s=setup();s.action('cast',idle);s.enemyShots.push({position:{x:0,y:1.2,z:6.4},velocity:{x:0,y:0,z:-5},life:2,damage:12,radius:.15});tick(s,.1);expect(s.player.hp).toBeLessThan(100);expect(s.combat.pending).toBeNull();tick(s,.5);expect(s.elements.states.size).toBe(0);expect(s.combat.mana).toBe(80);
 });
 it('crafts finite recovery, denies full-inventory crafting atomically, and never uses a full-mana dose',()=>{
  const s=setup();s.survival.inventory[7]=42;s.survival.inventory[3]=21;expect(executeGameCommand(s,{type:'craft',id:'mana-draught',count:20}).ok).toBe(true);expect(s.survival.inventory[7]).toBe(2);expect(s.survival.inventory[3]).toBe(1);expect(executeGameCommand(s,{type:'craft',id:'mana-draught'}).ok).toBe(false);expect(s.survival.inventory[7]).toBe(2);expect(executeGameCommand(s,{type:'consume',id:'mana-draught'}).ok).toBe(false);expect(s.campaign.state.items['mana-draught']).toBe(20);
  s.combat.mana=0;s.action('cast',idle);expect(s.player.phase).toBe('idle');expect(executeGameCommand(s,{type:'consume',id:'mana-draught'}).ok).toBe(true);expect(s.combat.mana).toBe(60);expect(s.campaign.state.items['mana-draught']).toBe(19);s.action('cast',idle);expect(s.combat.mana).toBe(40);expect(executeGameCommand(s,{type:'consume',id:'mana-draught'}).ok).toBe(false);
 });
 it('requires an earned skill and supported weapon before spending focus and preserves terrain cover',()=>{
  const s=setup();s.focus.value=100;s.action('special',idle);expect(s.focus.value).toBe(100);expect(s.events.at(-1)?.text).toContain('ランク1');for(let i=0;i<4;i++)s.campaign.defeat('fixture-'+i);expect(s.campaign.learn('vigor').ok).toBe(true);s.action('special',idle);expect(s.focus.value).toBe(100);expect(s.events.at(-1)?.text).toContain('装備');s.survival.inventory[4]=2;s.survival.inventory[3]=3;expect(s.campaign.craft('dagger',s.player.position).ok).toBe(true);s.campaign.equip('dagger');s.player.position={x:0,y:.25,z:-4};s.player.yaw=0;s.player.pitch=0;const hp=s.enemies[0].hp;s.arena.field.box({x:-1,y:.25,z:-5},{x:1,y:3,z:-4.75},3,'focus-cover');s.action('special',idle);expect(s.focus.value).toBe(0);expect(s.enemies[0].hp).toBe(hp);
 });
 it('isolates mana and focus per actor, denies guest magic before spending, and cancels permission revoked during casting',()=>{
  const s=setup(),g=s.enableCompanion({x:2,y:.25,z:6});s.withCompanion(()=>aim(s,{x:2.5,y:.8,z:7.1}));s.companionAction('cast');expect(s.companionSnapshot()!.aux.combat!.mana).toBe(100);expect(g.phase).toBe('idle');s.companionCanEdit=true;s.companionAction('cast');expect(s.companionSnapshot()!.aux.combat!.mana).toBe(80);expect(s.combat.mana).toBe(100);s.withCompanion(()=>{s.focus.value=36;});expect(s.focus.value).toBe(0);s.companionCanEdit=false;tick(s,.6);expect(s.companionSnapshot()!.aux.combat!.pending).toBeNull();expect(s.elements.states.size).toBe(0);
 });
 it('persists spent resources, safely defaults old saves and frames, and rejects corrupt fields without mutation',()=>{
  const s=setup();s.action('cast',idle);const save=captureCampaign(s,defaultSettings());expect(save.combat!.mana).toBe(80);expect(save.combat!.pending).toBeNull();expect(restoreCampaignInto(s,save)).not.toBeNull();expect(s.combat.mana).toBe(80);expect(s.player.phase).toBe('idle');const bad=structuredClone(save);bad.combat!.mana=Infinity;expect(isCampaignSave(bad)).toBe(false);expect(restoreCampaignInto(s,bad)).toBeNull();expect(s.combat.mana).toBe(80);delete save.combat;expect(restoreCampaignInto(s,save)).not.toBeNull();expect(s.combat).toEqual(createCombatResources());
  s.combat.mana=20;s.enableCompanion({x:2,y:.25,z:6});s.withCompanion(()=>{s.combat.mana=60;s.focus.value=24;});const client=setup(),frame=captureGameFrame(s);expect(validGameFrame(frame,s.enemies.length)).toBe(true);expect(applyGameFrame(client,frame)).not.toBeNull();expect(client.combat.mana).toBe(60);expect(client.focus.value).toBe(24);expect(applySharedCampaign(client,captureSharedCampaign(s,defaultSettings())).ok).toBe(true);expect(client.combat.mana).toBe(60);frame.guest!.aux.combat!.mana=-1;expect(applyGameFrame(client,frame)).toBeNull();expect(client.combat.mana).toBe(60);delete frame.host.combat;delete frame.guest!.aux.combat;expect(applyGameFrame(client,frame)).not.toBeNull();expect(client.combat).toEqual(createCombatResources());
 });
 it('credits a guest arrow contact only to the actor that fired it',()=>{const s=new CoreSimulation(true,false,true);s.enableCompanion({x:2,y:.25,z:6});const hp=s.enemies[0].hp;s.arrows.push({owner:'guest',position:{x:0,y:1.4,z:-5},velocity:{x:0,y:0,z:-8},life:2});tick(s,.2);expect(s.enemies[0].hp).toBeLessThan(hp);expect(s.focus.value).toBe(0);expect(s.companionSnapshot()!.aux.combat!.focus.value).toBe(12);});
 it('rejects oversized, nonfinite and inconsistent transient records',()=>{
  const state=createCombatResources();for(const extra of [{mana:101},{charge:NaN},{charging:false,charge:.5},{pending:'fire',castRemaining:0},{castRemaining:.2},{x:1},{focus:{value:100,confirmedHitIds:[],spentActionIds:[],x:1}}])expect(validCombatResources({...state,...extra})).toBe(false);expect(validCombatResources(state)).toBe(true);
 });
});

it('clears saved companion casts even when replacing an already suspended companion',()=>{const s=setup();s.enableCompanion();s.companionCanEdit=true;s.withCompanion(()=>{aim(s,{x:-1.7,y:.58,z:6.25});s.action('cast',idle);});expect(s.companionSnapshot()!.aux.combat!.pending).toBe('fire');const save=captureCampaign(s,defaultSettings());s.setCompanionConnected(false);expect(restoreCampaignInto(s,save)).not.toBeNull();const restored=s.companionSnapshot()!;expect(restored.aux.combat!.mana).toBe(80);expect(restored.aux.combat!.pending).toBeNull();expect(restored.aux.combat!.charging).toBe(false);expect(restored.player.phase).toBe('idle');});
