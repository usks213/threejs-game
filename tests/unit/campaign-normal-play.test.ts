import {describe,it,expect} from 'vitest';
import {captureCampaign,hydrateCampaign,defaultSettings} from '../../src/prototype/campaign-session';
import type {Action,Controls} from '../../src/prototype/core/simulation';
import {NormalPlayer,playFirstChapter} from './helpers/normal-campaign-player';
class DelayedRidgePlayer extends NormalPlayer {
 private ridgeCombat=false;
 override act(action:Action,input:Partial<Controls>={}){
  // Model the measured browser round trips after releasing the shield. This
  // advances the real world with neutral input; it never grants health or time.
  if(this.ridgeCombat&&action==='attack')this.advance(.35);
  super.act(action,input);
 }
 override fight(index:number,recover?:()=>void){
  if(index!==3){super.fight(index,recover);return;}
  const p=this.sim.player,e=this.sim.enemies[index];
  expect(p.position.z,'Face the ridge guard before passing it').toBeGreaterThan(-26);
  expect(Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z),'Leave space for the real look gesture').toBeGreaterThan(4);
  this.look({...e.position,y:e.position.y+1.52});this.advance(1.5);
  this.ridgeCombat=true;try{super.fight(index,recover);}finally{this.ridgeCombat=false;}
 }
}

describe('first chapter through ordinary production Core controls (not browser input evidence)',()=>{
 it('gathers, rescues, equips, traverses, fights, upgrades, reaches camp and hydrates without grants',()=>{
  const d=new NormalPlayer(),s=d.sim;playFirstChapter(d,{reserveRidgeMedicine:true});
  const saved=captureCampaign(s,defaultSettings()),restored=hydrateCampaign(JSON.parse(JSON.stringify(saved)));expect(restored).not.toBeNull();expect(restored!.sim.campaign.snapshot()).toEqual(s.campaign.snapshot());expect(restored!.sim.survival.exportState()).toEqual(s.survival.exportState());expect(restored!.sim.weather).toEqual(s.weather);expect(s.npc.visible).toBe(true);expect(restored!.sim.npc.snapshot()).toEqual(s.npc.snapshot());
 },60000);
 it('reaches the ridge with acquired medicine and survives measured look/counter delays without grants',()=>{
  const d=new DelayedRidgePlayer();playFirstChapter(d,{reserveRidgeMedicine:true});expect(d.sim.enemies[3].hp).toBe(0);expect(d.sim.campaign.state.campUnlocked).toBe(true);expect(d.sim.campaign.state.deaths).toBe(0);
 },60000);
});
