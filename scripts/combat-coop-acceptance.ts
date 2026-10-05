/** Bounded, no-fixture combat route. All supplies, equipment, movement and
 * attacks are earned through production SessionAuthority client actions.
 * The controls are replayable by the shared two-real-WebSocket driver. */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContinuousCoopJourney} from './playthrough-coop';
import type {GameAction} from '../src/game/types';
import type {Vec3} from '../src/world/types';
import type {PlayerInput} from '../src/simulation/protocol';

/** Observing the same normal client frames as AuthorityRoom is significant:
 * withActor refreshes a personal shared-time cache, which death loot reads.
 * These are ordinary read-only views, never state or fixture assignments. */
class CombatJourney extends ContinuousCoopJourney {
 constructor(output:string){super(output);this.observeFrame();}
 private observeFrame(){for(const id of this.players)if(this.room.actors.has(id))this.room.view(id);}
 override step(ticks=6,inputs:Record<string,PlayerInput>={}){for(let i=0;i<ticks;i++){super.step(1,inputs);if(this.sim.tick%3===0)this.observeFrame();}}
 override restart(name:string){super.restart(name);this.observeFrame();}
}

export function combatAcceptance(j:ContinuousCoopJourney):void {
 const [a,b]=j.players,observations:Record<string,unknown>[]=[];
 const note=(stage:string,data:Record<string,unknown>={})=>{const captured=structuredClone(data);observations.push({stage,tick:j.sim.tick,...captured});writeFileSync(resolve(j.output,'combat-observations.json'),JSON.stringify(observations,null,2));j.event('combat-assertion',{assertion:stage,...captured});};
 const action=(player:string,kind:GameAction,id?:string,aim:Vec3={x:0,y:0,z:1})=>j.message(player,{type:'game-action',action:kind,id,aim},0);
 const state=(id:string)=>j.actor(id).adventure.state;
 j.stage='combat-earned-equipment';j.step(30);j.pair(0,9);
 for(const kind of ['wood','stone','resin']){const node=j.sim.adventure.state.resources.find(n=>n.drop&&n.kind===kind&&n.amount>0);j.require(node,'Missing actual starter supply '+kind);j.act('gather',String(node.id));}
 const branches=[3000330,3000006];
 for(const id of branches){const node=j.sim.adventure.state.resources.find(n=>n.id===id&&n.kind==='branch');j.require(node,'Missing real branch '+id);j.walk(node.x-1.5,node.z-1.5,a);j.act('gather',String(id));}
 j.act('return',undefined,undefined,a);j.pair(0,9);
 j.require(state(a).inventory.wood===18&&state(a).inventory.resin===4&&state(a).inventory.stone===8,'Gathered resources must match cache plus two real branches');
 for(const id of ['shield','crudeBow','woodArrow'])j.act('craft',id,undefined,a);
 j.require(state(a).inventory.wood===2&&state(a).inventory.resin===0&&state(a).inventory.stone===7,'Crafted loadout must pay exact recipe costs');
 for(const kind of ['crudeBow','woodArrow']){j.act('drop',`${kind}:${kind==='woodArrow'?12:1}`,undefined,a);const drop=j.sim.adventure.state.resources.find(n=>n.drop&&n.kind===kind&&n.amount>0);j.require(drop,'Transferred gear must be a ground drop');j.act('gather',String(drop.id),undefined,b);}
 j.act('equip','club',undefined,a);j.act('equip','crudeBow',undefined,b);
 j.require(state(a).inventory.shield===1&&state(b).inventory.crudeBow===1&&state(b).inventory.woodArrow===12,'Both actors must own their actual crafted loadout');
 note('earned-shield-bow-arrows',{branches,players:j.players.map(id=>({id,inventory:structuredClone(state(id).inventory),equipment:state(id).equipment}))});j.checkpoint('combat-earned-loadout');
 const targetId=3000111;
 const enemy=()=>{const e=j.sim.adventure.state.enemies.find(e=>e.id===targetId);j.require(e&&e.definition==='walker'&&e.health>0,'Real eastern walker must remain alive');return e;};
 const aimAt=(id:string,height=0)=>{const p=j.actor(id).player,e=enemy(),dx=e.x-p.x,dy=e.y+height-p.y,dz=e.z-p.z,d=Math.hypot(dx,dy,dz);return {x:dx/d,y:dy/d,z:dz/d};};
 const wait=(condition:()=>boolean,label:string,limit=450)=>{for(let t=0;t<limit&&!condition();t++){j.step(1);j.require(state(a).health>0&&state(b).health>0,'Actor downed during '+label);}j.require(condition(),'Timed out waiting for '+label);};
 j.stage='combat-held-guard';j.walk(16,17,a);j.walk(20,18,a);j.walk(23,19,a);
 wait(()=>enemy().windup>.5,'first natural enemy windup');action(a,'guard','on',aimAt(a));
 wait(()=>enemy().windup>0&&enemy().windup<=1/30+.00001,'guard impact window');
 const blockBefore={health:state(a).health,stamina:state(a).stamina,durability:state(a).meadows!.durability.shield};j.step(1);
 j.require(enemy().windup===0&&enemy().attackKind==='recover','Actual enemy strike must resolve');
 j.require(state(a).health===blockBefore.health-5&&state(a).stamina<blockBefore.stamina&&state(a).meadows!.durability.shield<blockBefore.durability,'Held shield must reduce a 12-damage strike to 5 after armor and pay stamina/durability');
 j.require(!(enemy().stagger??0),'Early held guard must not be recorded as a parry');
 note('held-guard-block',{enemyId:targetId,before:blockBefore,after:{health:state(a).health,stamina:state(a).stamina,durability:state(a).meadows!.durability.shield,enemy:structuredClone(enemy())}});j.checkpoint('combat-held-guard-block');
 action(a,'guard','off');j.stage='combat-dodge';
 wait(()=>enemy().windup>0&&enemy().windup<.19,'next natural dodge window');
 const dodgeBefore={player:{...j.actor(a).player},health:state(a).health,stamina:state(a).stamina,windup:enemy().windup};
 // A lateral dodge uses the real invulnerability/movement window. The enemy
 // commits its swing; the test does not cancel or move the enemy.
 const toward=aimAt(a);action(a,'dodge',undefined,{x:toward.z,y:0,z:-toward.x});
 j.require(state(a).stamina===dodgeBefore.stamina-22,'Dodge must immediately spend 22 stamina');
 wait(()=>enemy().windup===0,'natural swing during dodge',20);
 j.require(state(a).health===dodgeBefore.health&&j.actor(a).adventure.dodge>.16&&j.actor(a).adventure.dodge<.46,'Enemy strike must resolve inside actual dodge window without damage');
 j.require(Math.hypot(j.actor(a).player.x-dodgeBefore.player.x,j.actor(a).player.z-dodgeBefore.player.z)>.25,'Actual dodge must move the actor');
 note('dodge-during-committed-strike',{enemyId:targetId,before:dodgeBefore,after:{player:{...j.actor(a).player},health:state(a).health,stamina:state(a).stamina,dodge:j.actor(a).adventure.dodge,enemy:structuredClone(enemy())}});j.checkpoint('combat-dodge-strike');
 wait(()=>j.actor(a).adventure.dodge===0,'dodge recovery',30);j.walk(23,19,a);j.stage='combat-timed-parry';
 wait(()=>enemy().windup>0&&enemy().windup<.14,'natural parry window');
 const parryBefore={health:state(a).health,stamina:state(a).stamina,windup:enemy().windup};action(a,'guard','on',aimAt(a));
 wait(()=>(enemy().stagger??0)>0,'actual timed parry',10);
 j.require(state(a).health===parryBefore.health-2&&state(a).stamina<parryBefore.stamina&&(enemy().stagger??0)>1.9,'Timed parry must block the strike and stagger its actual attacker');
 note('timed-parry-stagger',{enemyId:targetId,before:parryBefore,after:{health:state(a).health,stamina:state(a).stamina,enemy:structuredClone(enemy())}});j.checkpoint('combat-timed-parry');
 action(a,'guard','off');j.stage='combat-charged-melee';
 action(a,'charge-start');j.step(45);j.require(j.actor(a).adventure.chargeProgress===1,'Charge must accumulate through 45 actual input ticks');
 const chargeBefore={health:enemy().health,stamina:state(a).stamina};const charged=action(a,'charge-release',undefined,aimAt(a));
 j.require(charged.message==='溜め攻撃 100%'&&j.actor(a).adventure.attackMotion?.heavy===true,'Full charge must produce its actual heavy attack');
 wait(()=>enemy().health<chargeBefore.health,'charged melee contact',30);
 j.require(enemy().health<chargeBefore.health&&state(a).stamina<chargeBefore.stamina,'Charged melee must hit the enemy and spend stamina');
 note('full-charge-melee-hit',{enemyId:targetId,before:chargeBefore,after:{enemy:structuredClone(enemy()),stamina:state(a).stamina}});j.checkpoint('combat-charged-melee-hit');
 wait(()=>j.actor(a).adventure.attack===0,'heavy recovery',45);action(a,'guard','on',aimAt(a));
 j.stage='combat-ranged-cooperation';const e=enemy();j.walk(e.x-5,e.z-4,b);
 const rangedBefore={health:enemy().health,arrows:state(b).inventory.woodArrow,equipmentDurability:state(b).meadows!.durability.crudeBow};
 const p=j.actor(b).player,target=enemy(),dx=target.x-p.x,dz=target.z-p.z,range=Math.hypot(dx,dz),flight=range/12,dy=target.y+.65-(p.y+.85)+2.5*flight*flight,length=Math.hypot(dx,dy,dz);
 action(b,'attack',undefined,{x:dx/length,y:dy/length,z:dz/length});
 j.require(state(b).inventory.woodArrow===rangedBefore.arrows-1&&state(b).meadows!.durability.crudeBow<rangedBefore.equipmentDurability,'Real bow shot must consume one earned arrow and durability');
 const targetAfter=()=>j.sim.adventure.state.enemies.find(e=>e.id===targetId)!;
 wait(()=>targetAfter().health<=0,'real bow projectile hit',80);
 j.require(targetAfter().health<=0,'Second actor must defeat target with real projectile');
 const drops=j.sim.adventure.state.resources.filter(n=>n.drop&&n.amount>0&&['stone','iron','coins'].includes(n.kind));
 j.require(drops.some(n=>n.kind==='iron'&&n.amount===1)&&drops.some(n=>n.kind==='coins'&&n.amount===2),'Walker loot must appear on ground');
 note('second-actor-ranged-kill',{enemyId:targetId,range,before:rangedBefore,after:{enemy:structuredClone(targetAfter()),arrows:state(b).inventory.woodArrow,equipmentDurability:state(b).meadows!.durability.crudeBow},loot:drops});j.checkpoint('combat-ranged-kill-ground-loot');
 action(a,'guard','off');j.walk(targetAfter().x,targetAfter().z,b);
 const rewards=drops.filter(n=>Math.hypot(n.x-targetAfter().x,n.z-targetAfter().z)<3);
 for(const drop of rewards)j.act('gather',String(drop.id),undefined,b);
 j.require(state(b).inventory.iron===1&&state(b).inventory.coins===2&&state(b).inventory.stone===3,'Rewards must enter inventory only via actual pickups');
 note('ranged-actor-collected-reward',{inventory:structuredClone(state(b).inventory)});
 for(const id of j.players)j.act('return',undefined,undefined,id);
 j.restart('combat-reward-save-restart');
 j.event('route-complete',{scope:'earned-two-player-guard-parry-dodge-charge-ranged-reward',fixturesReplaced:false,assertions:observations.map(o=>o.stage)});j.flush();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const j=new CombatJourney(process.env.COMBAT_OUTPUT??'/tmp/voxel-combat-source');
 try{combatAcceptance(j);}catch(error){j.event('blocked',{message:String(error),stack:error instanceof Error?error.stack:undefined,players:j.players.map(id=>({id,player:{...j.actor(id).player},health:j.actor(id).adventure.state.health})),enemies:j.sim.adventure.state.enemies.filter(e=>e.id===3000111)});j.flush();process.exitCode=1;}
}
