import {describe,it,expect} from 'vitest';
import {NormalPlayer} from './helpers/normal-campaign-player';
import {playFirstTwoRegions} from './helpers/normal-regional-player';
import {captureCampaign,hydrateCampaign,defaultSettings} from '../../src/prototype/campaign-session';

/** Close on ranged threats with ordinary movement, and clear summoned melee
 * threats rather than trying to hold a shield forever under crossfire. */
function assault(d:NormalPlayer,index:number,minX=25.1,maxX=29){
 const s=d.sim,boss=s.enemies[index];
 const step=(input:Parameters<NormalPlayer['tick']>[0]={})=>{const attack=s.tactics.get(boss.id)?.attack;if(s.player.grounded&&attack?.kind==='burst'&&attack.remaining<.3)d.act('jump');d.tick(input);};
 for(let cycle=0;cycle<70&&boss.hp>0;cycle++){
  d.idle();d.heal();const p=s.player;
  // Clear a body blocking the approach, but finish a reachable caster/summoner
  // instead of letting an endless supply of minions replace the actual target.
  const nearby=Math.hypot(boss.position.x-p.position.x,boss.position.z-p.position.z)>2.3?s.enemies.find(e=>e.hp>0&&e.summonOwner!==undefined&&Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z)<1.4):undefined;
  const e=nearby??boss;d.look({...e.position,y:e.position.y+1.2});
  if(p.stamina<25){let side=p.position.x>(minX+maxX)/2?-1:1;for(let n=0;n<90;n++){if(p.position.x>maxX)side=-1;if(p.position.x<minX)side=1;step({x:Math.cos(p.yaw)*side,z:-Math.sin(p.yaw)*side});if(n%15===0)d.heal();}continue;}
  const distance=()=>Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z);
  if(distance()>1.5){for(let n=0;n<9;n++)step({z:1});continue;}
  d.act(s.focus.value>=100?'special':'attack');for(let n=0;n<120&&p.phase!=='idle';n++)step({z:.4});expect(p.phase).toBe('idle');
 }
 expect(boss.hp,d.diagnostic('regional group defeated')).toBeLessThanOrEqual(0);
}

/** Guard a melee approach, then counter from sword range. The new local routes
 * let a spear or mine guard leave its former obstruction and meet the player. */
function approachDuel(d:NormalPlayer,index:number,minX:number,maxX:number){
 const s=d.sim,e=s.enemies[index],p=s.player;
 for(let round=0;round<18&&e.hp>0;round++){
  d.idle();d.heal();d.look({...e.position,y:e.position.y+1.2});
  if(p.stamina<45){let side=p.position.x>(minX+maxX)/2?-1:1;for(let n=0;n<78;n++){if(p.position.x>maxX)side=-1;if(p.position.x<minX)side=1;d.tick({x:Math.cos(p.yaw)*side,z:-Math.sin(p.yaw)*side});}continue;}
  d.until(()=>Math.hypot(e.position.x-p.position.x,e.position.z-p.position.z)<1.5,8,{z:1,block:true},'close inside melee reach');
  d.look({...e.position,y:e.position.y+1.2});d.until(()=>['recover','stagger','dead'].includes(e.phase),12,{block:true},'guard approaching melee enemy');
  if(e.hp<=0)break;d.act('attack');d.idle();
 }
 expect(e.hp,d.diagnostic('approaching melee enemy defeated')).toBeLessThanOrEqual(0);
}

/** Remain on the western shore; do not chase a charging guardian underwater. */
function shoreDuel(d:NormalPlayer,index:number){
 const s=d.sim,e=s.enemies[index];let towardNorth=true;
  const step=()=>{if(s.combat.pending)for(const [dx,dy] of [[0,1.2],[0,1.55],[0,.8],[0,.45],[-.25,1.1],[.25,1.1],[-.18,.35],[.18,.35]]){d.track({x:e.position.x+dx,y:e.position.y+dy,z:e.position.z});if(s.target(7)?.enemy?.id===index)break;}const p=s.player,attack=s.tactics.get(e.id)?.attack;if(p.grounded&&attack?.kind==='burst'&&attack.remaining<.3)d.act('jump');if(p.position.z< -50)towardNorth=false;if(p.position.z> -47.5)towardNorth=true;const vz=towardNorth?-1:1,input={x:-Math.sin(p.yaw)*vz,z:-Math.cos(p.yaw)*vz};if(attack?.kind==='lunge'&&attack.remaining<.13&&p.phase==='idle')d.act('dodge',input);d.tick(input);};
 for(let cycle=0;cycle<50&&e.hp>0;cycle++){
  d.idle();d.heal();
  if(s.player.hp<65&&!s.campaign.has('bandage')&&s.survival.inventory[7]>=3&&s.survival.inventory[10]>=1){d.menu('craft','bandage');d.heal();}
  // A shore-safe guardian can still cover the shore with its burst. Stay free
  // to jump through an imminent release before committing to a spell recovery.
  for(let n=0;n<60&&['burst','lunge'].includes(s.tactics.get(e.id)?.attack?.kind??'')&&s.tactics.get(e.id)!.attack!.remaining<.9;n++)step();
  for(const [dx,dy] of [[0,1.2],[0,1.55],[0,.8],[0,.45],[-.25,1.1],[.25,1.1],[-.18,.35],[.18,.35]]){d.look({x:e.position.x+dx,y:e.position.y+dy,z:e.position.z});if(s.target(7)?.enemy?.id===index)break;}
  expect(s.target(7)?.enemy?.id,d.diagnostic('guardian visible from shore')).toBe(index);
  const element=s.enemyElements[index].wet>1?'lightning':'water';while(s.selectedElement!==element)d.act('element-next');
  // Keep this ranged shoreline strategy on water/lightning. A melee Focus
  // impulse can legitimately knock the guardian below the bank and occlude it.
  if(s.combat.mana<20)d.menu('consume','mana-draught');d.act('cast');expect(s.player.phase,d.diagnostic('shore spell accepted')).toBe('cast');
  for(let n=0;n<66;n++){step();if(n%15===0&&s.player.phase==='idle')d.heal();}
 }
 expect(e.hp,d.diagnostic('shore guardian defeated')).toBeLessThanOrEqual(0);
}

describe('regional progression through ordinary production Core controls (not browser input evidence)',()=>{
 it('continues from original spawn through all seven regional seals, bosses and successive hearth unlocks without grants or teleporting',()=>{
  const d=new NormalPlayer(),s=d.sim;playFirstTwoRegions(d,14);
  // Eastern shallows: use the authored stair route, then return on the same bridge.
  for(const [x,z] of [[0,5.3],[11,5.3],[11,3],[16,3],[16,-12],[21,-12],[24,-12]])d.walk(x,z);
  // The spear can now route around the stair. Close inside its reach instead of
  // repeatedly countering from spear range and backing off the eastern cliff.
  approachDuel(d,s.enemies.findIndex(e=>e.regional===104),23.5,29);d.walk(23.5,-13.3);d.walk(27.5,-13.3);
  d.interact('rg-fen-cache',{x:28,y:2.55,z:-14});expect(s.campaign.state.items['fen-seal']).toBe(1);d.checkpoint('third regional seal');
  for(const [x,z] of [[23.5,-13.3],[24,-12],[21,-12],[16,-12],[16,3],[11,3],[11,5.3],[0,5.3],[-3.5,5.3]])d.walk(x,z);
  d.interact('hearth',{x:-3,y:.9,z:4});expect(s.campaign.regionUnlocked('coppermesa')).toBe(true);
  for(const [x,z] of [[0,5.3],[0,9.5],[-10,9.5],[-10,-25],[-16,-25],[-20,-25],[-22,-25]])d.walk(x,z);
  // The mine guard follows the approach now. Resolve that encounter before
  // walking through its body toward the tunnel while the archer has a clear shot.
  approachDuel(d,s.enemies.findIndex(e=>e.regional===106),-26,-21);
  for(const [x,z] of [[-26,-25],[-28,-24],[-30,-24],[-30,-25.5],[-30,-27]])d.walk(x,z);
  d.interact('rg-mesa-cache',{x:-30,y:3.55,z:-29});expect(s.campaign.state.items['mesa-seal']).toBe(1);d.checkpoint('fourth regional seal');
  for(const [x,z] of [[-30,-24],[-28,-24],[-26,-25],[-20,-25],[-16,-25],[-10,-25],[-10,9.5],[0,9.5],[0,5.3],[-3.5,5.3]])d.walk(x,z);
  d.interact('hearth',{x:-3,y:.9,z:4});expect(s.campaign.regionUnlocked('cinderkeep')).toBe(true);
  for(const id of ['vigor','endurance','attunement'])d.menu('learn',id);
  for(const id of ['iron-blade','hide-coat']){d.menu('gear','repair:'+id);d.menu('gear','upgrade:'+id);}
  for(let n=0;n<5;n++)d.menu('craft','bandage');d.menu('craft','berry-meal');d.menu('consume','berry-meal');while(s.campaign.has('bandage')&&s.player.hp<s.campaign.maxHp-10)d.menu('consume','bandage');
  d.walk(-4,7);d.interact('berries-0',{x:-5,y:.8,z:7});d.walk(-4,8.8);d.walk(-7,8.8);d.interact('berries-1',{x:-7,y:.8,z:7});d.walk(-9,8.8);d.interact('berries-2',{x:-9,y:.8,z:7});d.walk(-10,8.8);d.walk(-10,5.3);d.walk(-3.5,5.3);for(let n=0;n<4;n++)d.menu('craft','bandage');
  for(const [x,z] of [[0,5.3],[11,5.3],[11,3],[16,3],[13,-27],[13,-33],[16,-33],[16,-30],[22,-30],[23,-28],[26,-28]])d.walk(x,z);
  d.walk(26,-30.5);assault(d,s.enemies.findIndex(e=>e.regional===107));d.heal();
  d.walk(27,-31);assault(d,s.enemies.findIndex(e=>e.regional===108));
  d.walk(28,-34);d.interact('rg-ash-cache',{x:29,y:3.55,z:-35});expect(s.campaign.state.items['ash-seal']).toBe(1);d.checkpoint('fifth regional seal');
  for(const [x,z] of [[26,-32],[26,-28],[23,-28],[22,-30],[16,-30],[16,-33],[13,-33],[13,3],[11,3],[11,5.3],[0,5.3],[-3.5,5.3]])d.walk(x,z);
  d.interact('hearth',{x:-3,y:.9,z:4});expect(s.campaign.regionUnlocked('rimepass')).toBe(true);
  d.walk(-4,5.8);d.interact('berries-3',{x:-5,y:.8,z:5});d.walk(-6,4.1);d.interact('berries-4',{x:-7,y:.8,z:5});d.walk(-8.3,4.1);d.interact('berries-5',{x:-9,y:.8,z:5});d.walk(-10,4.1);d.walk(-10,9.5);d.walk(0,9.5);d.walk(0,5.3);d.walk(-3.5,5.3);d.walk(-3.5,2.2);d.interact('berries-6',{x:-5,y:.8,z:3});
  for(const id of ['iron-blade','hide-coat'])if(s.campaign.gearInfo(id).durability<100)d.menu('gear','repair:'+id);
  for(let n=0;n<6;n++)d.menu('craft','bandage');while(s.campaign.has('bandage')&&s.player.hp<s.campaign.maxHp-10)d.menu('consume','bandage');
  for(const [x,z] of [[0,5.3],[0,9.5],[-10,9.5],[-10,-33],[-7,-33],[-7,-40],[-7,-42.5]])d.walk(x,z);d.act('jump');d.walk(-7,-44);d.walk(-7,-48);
  assault(d,s.enemies.findIndex(e=>e.regional===109),-10,-4);d.walk(-5,-50.5);d.interact('rg-rime-cache',{x:-4,y:5.55,z:-52});expect(s.campaign.state.items['rime-seal']).toBe(1);d.checkpoint('sixth regional seal');
  d.walk(-8.5,-51);const beforeCrystal=s.survival.inventory[3];d.interact('rg-rime-crystal',{x:-10,y:5.9,z:-52});expect(s.campaign.state.claimedPoints).toContain('rg-rime-crystal');expect(s.survival.inventory[3]).toBe(beforeCrystal+6);
  for(const [x,z] of [[-7,-48],[-7,-44],[-7,-40],[-7,-33],[-10,-33],[-10,9.5],[0,9.5],[0,5.3],[-3.5,2.2]])d.walk(x,z);
  d.interact('hearth',{x:-3,y:.9,z:4});expect(s.campaign.regionUnlocked('mirrorlake')).toBe(true);
  for(const id of ['iron-blade','hide-coat'])if(s.campaign.gearInfo(id).durability<100)d.menu('gear','repair:'+id);d.menu('gear','upgrade:iron-blade');
  // After the near crown is depleted, step around the goat under the remaining
  // foliage, then return to the approach lane before leaving the tree.
  for(const [x,z] of [[-3.5,5.3],[0,5.3],[0,9.5],[-10,9.5],[-10,1.9],[-6,1.9]])d.walk(x,z);d.act('chisel');d.harvest(7,56,[{x:-5.75,y:3.4,z:3},{x:-5.4,y:3.5,z:3},{x:-6.1,y:3.5,z:3}],'tree0',()=>d.walk(-6.3,2.8));d.walk(-6,1.9);d.act('sword');for(const [x,z] of [[-10,1.9],[-10,9.5],[0,9.5],[0,5.3],[-3.5,5.3]])d.walk(x,z);
  d.menu('craft','berry-meal');d.menu('consume','berry-meal');for(let n=0;n<8;n++)d.menu('craft','bandage');while(s.campaign.has('bandage')&&s.player.hp<s.campaign.maxHp-10)d.menu('consume','bandage');
  for(const [x,z] of [[0,5.3],[11,5.3],[11,3],[13,3],[13,-40],[13,-44],[15,-45.7]])d.walk(x,z);
  approachDuel(d,s.enemies.findIndex(e=>e.regional===110),9.5,16.5);d.heal();
  for(let n=0;n<14;n++)d.menu('craft','mana-draught');d.walk(10,-44);d.walk(9.5,-47);shoreDuel(d,s.enemies.findIndex(e=>e.regional===111));d.heal();
  d.walk(10,-48);d.look({x:13,y:1.3,z:-50});d.until(()=>s.player.position.x>12.1,6,{z:1},'swim into lake vault');
  d.interact('rg-lake-cache',{x:13,y:1.55,z:-50});expect(s.campaign.state.items['lake-seal']).toBe(1);d.checkpoint('seventh regional seal');
  d.look({x:10,y:4.8,z:-48});d.until(()=>s.player.position.x<10.7&&s.player.position.y>2.7,12,{z:1},'swim back to the western bank');d.walk(10,-46.5);d.interact('rg-lake-hearth',{x:10,y:3.9,z:-45});expect(s.campaign.state.claimedPoints).toContain('rg-lake-hearth');expect(s.oxygen).toBeGreaterThan(0);
  expect(s.campaign.state.deaths).toBe(0);expect(s.campaign.state.claimedPoints).toEqual(expect.arrayContaining(['rg-field-cache','rg-field-herb','rg-wood-cache','rg-fen-cache','rg-mesa-cache','rg-ash-cache','rg-rime-cache','rg-lake-cache']));
  expect(s.campaign.state.unlockedRegions).toHaveLength(7);for(const seal of ['field','wood','fen','mesa','ash','rime','lake'])expect(s.campaign.state.items[seal+'-seal']).toBe(1);expect(s.campaign.state.claimedEnemies).toEqual(expect.arrayContaining(['regional:101','regional:102','regional:104','regional:106','regional:107','regional:108','regional:109','regional:110','regional:111']));
  const restored=hydrateCampaign(JSON.parse(JSON.stringify(captureCampaign(s,defaultSettings()))));expect(restored).not.toBeNull();expect(restored!.sim.campaign.snapshot()).toEqual(s.campaign.snapshot());expect(restored!.sim.survival.exportState()).toEqual(s.survival.exportState());expect(restored!.sim.weather).toEqual(s.weather);d.checkpoint('regional save verified');
 },180000);
});
