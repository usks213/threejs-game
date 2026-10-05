import {it,expect} from 'vitest';
import {NormalPlayer} from './helpers/normal-campaign-player';
import {playFirstTwoRegions} from './helpers/normal-regional-player';
import {WEST_ROUTES} from '../../src/prototype/core/expedition-west';
import {captureCampaign,hydrateCampaign,defaultSettings} from '../../src/prototype/campaign-session';

function assault(d:NormalPlayer,index:number){const s=d.sim,e=s.enemies[index];for(let cycle=0;cycle<70&&e.hp>0;cycle++){d.idle();d.heal();d.look({...e.position,y:e.position.y+1.2});if(s.player.stamina<25){d.advance(2,{x:s.player.position.x<-61?1:-1});continue;}if(Math.hypot(e.position.x-s.player.position.x,e.position.z-s.player.position.z)>1.45){const before={...s.player.position};d.advance(.2,{z:1});if(Math.hypot(s.player.position.x-before.x,s.player.position.z-before.z)<.04)d.advance(.5,{x:1});continue;}d.act(s.focus.value>=100?'special':'attack');d.until(()=>s.player.phase==='idle',4,{z:.2},'western assault');}expect(e.hp,d.diagnostic('western enemy')).toBeLessThanOrEqual(0);}

it('completes western mine and both roads from the original start through normal production actions',()=>{
 const d=new NormalPlayer(true),s=d.sim;playFirstTwoRegions(d);expect(s.western!.accessible).toBe(true);
 for(let i=0;i<5;i++)d.menu('craft','bandage');for(let i=0;i<5&&s.player.hp<s.campaign.maxHp;i++)d.menu('consume','bandage');
 for(const id of ['iron-blade','hide-coat'])if(s.campaign.repairStatus(id,s.player.position).ok)d.menu('gear','repair:'+id);
 d.menu('craft','berry-meal');d.menu('consume','berry-meal');
 d.walk(-4,7);d.interact('berries-0',{x:-5,y:.8,z:7});d.walk(-4,8.8);d.walk(-7,8.8);d.interact('berries-1',{x:-7,y:.8,z:7});d.walk(-9,8.8);d.interact('berries-2',{x:-9,y:.8,z:7});d.walk(-10,8.8);d.walk(-10,5.3);d.walk(-3.5,5.3);for(let i=0;i<4;i++)d.menu('craft','bandage');
 for(const [x,z] of [[0,5.3],[0,9.5],[-10,9.5],[-10,-9],[-16,-9],[-22,-9],[-26,-9],[-27,-6],[-30,-6]])d.walk(x,z);
 for(const p of WEST_ROUTES[0].nodes.slice(1,5))d.walk(p.x,p.z);
 d.fight(18);d.walk(-49.7,-11.5);d.interact('west-hamlet-cache',{x:-50,y:1.1,z:-13});expect(s.western!.snapshot().claimed).toContain('west-hamlet-cache');
 d.walk(-47,-14);d.interact('west-return-hearth',{x:-46.5,y:1.35,z:-16});expect(s.western!.snapshot().campUnlocked).toBe(true);
 d.walk(-46,-13);for(const p of WEST_ROUTES[0].nodes.slice(5,-1))d.walk(p.x,p.z);
 assault(d,20);d.advance(4);d.heal();d.walk(-63,-40);assault(d,21);d.walk(-63,-43.8);d.interact('west-mine-switch',{x:-63.75,y:5.2,z:-44.3});expect(s.western!.snapshot().gateOpen).toBe(true);
 d.walk(-63,-43);d.walk(-61,-45);d.walk(-58,-43);d.interact('west-mine-cache',{x:-58,y:4.65,z:-45});expect(s.western!.snapshot().claimed).toContain('west-mine-cache');
 d.walk(-58,-43);for(const p of WEST_ROUTES[2].nodes)d.walk(p.x,p.z);expect(s.western!.snapshot().completed).toContain('west-safe-return');for(const p of [...WEST_ROUTES[2].nodes].reverse())d.walk(p.x,p.z);for(const [x,z] of [[-58,-43],[-61,-45],[-63,-43],[-63,-40],[-63,-38]])d.walk(x,z);for(const p of [...WEST_ROUTES[1].nodes].reverse()){d.walk(p.x,p.z);if(s.enemies[19].hp>0&&Math.hypot(s.enemies[19].position.x-s.player.position.x,s.enemies[19].position.z-s.player.position.z)<6)assault(d,19);}
 expect(s.western!.snapshot().completed).toContain('west-two-roads');
 expect(s.campaign.state.deaths).toBe(0);const saved=captureCampaign(s,defaultSettings()),restored=hydrateCampaign(JSON.parse(JSON.stringify(saved)));expect(restored).not.toBeNull();expect(restored!.sim.western!.snapshot()).toEqual(s.western!.snapshot());expect(restored!.sim.campaign.snapshot()).toEqual(s.campaign.snapshot());
 d.checkpoint('western settlement and checkpoint');
},60000);
