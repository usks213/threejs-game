/** POWER-A02 actual-input fusion transactions. Pristine two-player world;
 * read-only observations and ordinary controls only, with no granted fixtures. */
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContinuousCoopJourney} from './playthrough-coop';
import {selectedGear,type GearLot} from '../src/game/equipment/items';
import type {ClientMessage} from '../src/simulation/protocol';

const AIM={x:0,y:0,z:-1};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function fusionAcceptance(j:ContinuousCoopJourney):void {
 const [a,b]=j.players;
 const inventory=(id=a)=>structuredClone(j.actor(id).adventure.state.inventory);
 const lot=(kind:string,id=a)=>{const value=selectedGear(j.actor(id).adventure.state.gearItems!,kind);j.require(value,'Missing earned '+kind+' lot');return structuredClone(value);};
 const note=(name:string,data:Record<string,unknown>)=>j.event('fusion-evidence',{name,...data});
 const paid=()=>{const save=j.room.save();return {nextEntityId:save.nextEntityId,members:save.members?.map(member=>({id:member.id,inventory:member.adventure.inventory,gearItems:member.adventure.gearItems,equipment:member.adventure.equipment,offhand:member.adventure.meadows?.gear.offhand})),resources:save.adventure?.resources,skybound:save.skybound};};
 const reject=(player:string,message:ClientMessage,errorIncludes:string)=>{
  j.step(6);const before=paid();let error:unknown;
  try{j.room.action(player,message);}catch(caught){error=caught;}
  const after=paid();j.event('action-rejected',{player,message,error:String(error),expected:true,evidence:{errorIncludes,before,after,beforeSha256:digest(before),afterSha256:digest(after)}});
  j.require(error&&String(error).includes(errorIncludes),'Wrong expected rejection: '+String(error));
  j.require(digest(before)===digest(after),'Rejected fusion transaction changed paid state');
 };
 const refused=(player:string,action:'sky-fuse'|'sky-unfuse'|'gather',id:string,reason:string)=>reject(player,{type:'game-action',action,id,aim:AIM},reason);
 const identity=(before:GearLot,after:GearLot)=>j.require(before.id===after.id&&before.kind===after.kind&&before.count===after.count&&before.quality===after.quality&&before.durability===after.durability,'Fusion changed the equipment identity, quality or base durability');
 j.stage='fusion-shared-materials';j.step(30);
 let sharedWood=0;
 for(const kind of ['wood','stone','resin']){
  const resource=j.sim.adventure.state.resources.find(node=>node.drop&&node.kind===kind&&node.amount>0);j.require(resource,'Missing genuine shared cache '+kind);
  j.act('gather',String(resource.id));if(kind==='wood')sharedWood=resource.id;
 }
 refused(b,'gather',String(sharedWood),'拾えるもの');
 // Pick two existing branch nodes and a resin node, avoiding the authored combat routes.
 for(const target of [{kind:'branch',x:7.6,z:10.6},{kind:'branch',x:-15.5,z:11.4},{kind:'resin',x:-14.6,z:16.7}]){
  const resource=j.sim.adventure.state.resources.filter(node=>node.kind===target.kind&&!node.drop&&node.ready<=j.sim.adventure.state.seconds).sort((left,right)=>Math.hypot(left.x-target.x,left.z-target.z)-Math.hypot(right.x-target.x,right.z-target.z))[0];
  j.require(resource&&Math.hypot(resource.x-target.x,resource.z-target.z)<1,'Nearby genuine material is missing');
  j.pair(resource.x,resource.z);j.act('gather',String(resource.id));
 }
 for(const player of j.players)j.act('return',undefined,undefined,player);
 j.require(inventory().wood===18&&inventory().stone===8&&inventory().resin===5,'Earned materials differ');
 note('shared-materials-earned',{inventory:inventory(),sharedWood,additionalResources:'two naturally generated branches and one resin node'});
 j.act('craft','shield');j.act('craft','crudeBow');j.act('craft','woodArrow');j.act('equip','club');
 j.require(inventory().wood===2&&inventory().stone===7&&inventory().resin===1&&inventory().woodArrow===12,'Crafting did not spend the expected earned resources');
 j.checkpoint('fusion-earned-equipment');

 j.stage='fusion-weapon-atomicity';
 refused(a,'sky-fuse','club:crystal','素材が足りません');
 refused(a,'sky-fuse','club:wood','素材を選ぶ');
 refused(a,'sky-fuse','glider:stone','武器か盾');
 refused(b,'sky-fuse','club:resin','素材が足りません');
 const clubBefore=lot('club'),stoneBefore=inventory().stone;
 j.act('sky-fuse','club:stone');const fusedClub=lot('club');identity(clubBefore,fusedClub);
 j.require(inventory().stone===stoneBefore-1&&fusedClub.fusion?.damage===6&&fusedClub.fusion.effect==='impact'&&fusedClub.fusion.durability===30,'Weapon fusion did not consume one stone and attach one effect');
 refused(a,'sky-fuse','club:stone','素材を選ぶ');
 j.act('attack',undefined,undefined,a,AIM);
 refused(a,'sky-unfuse','club','動作の回復');
 j.step(30);const wornClub=lot('club');
 j.require(wornClub.id===fusedClub.id&&wornClub.quality===fusedClub.quality&&wornClub.durability===fusedClub.durability!-1&&wornClub.fusion?.durability===29&&inventory().stone===stoneBefore-1,'One genuine swing must wear the same fused club once, without spending another stone');
 note('weapon-fusion-and-use',{before:clubBefore,fused:fusedClub,afterSwing:wornClub,stoneBefore,stoneAfter:inventory().stone});

 j.stage='fusion-shield-and-projectile';
 const shieldBefore=lot('shield'),shieldStone=inventory().stone;
 j.act('sky-fuse','shield:stone');const fusedShield=lot('shield');identity(shieldBefore,fusedShield);
 j.require(j.actor(a).adventure.state.meadows?.gear.offhand==='shield'&&inventory().stone===shieldStone-1&&fusedShield.fusion?.damage===6&&fusedShield.fusion.effect==='impact'&&fusedShield.fusion.durability===30,'Equipped shield fusion is incorrect');
 const arrowBefore=inventory();j.act('sky-fuse','woodArrow:resin');const arrowAfter=inventory();
 j.require(arrowAfter.woodArrow===arrowBefore.woodArrow-1&&arrowAfter.resin===arrowBefore.resin-1&&arrowAfter.fireArrow===(arrowBefore.fireArrow??0)+1,'Arrow fusion must spend one arrow and one resin, yielding one fire arrow');
 refused(a,'sky-fuse','woodArrow:resin','素材が足りません');
 j.act('equip','crudeBow');const bowBefore=lot('crudeBow');j.act('attack',undefined,undefined,a,{x:0,y:1,z:0});
 const projectiles=j.actor(a).adventure.projectiles.map(projectile=>structuredClone(projectile)),shot=projectiles.find(projectile=>projectile.kind==='arrow'&&projectile.burn===5);
 j.require(shot&&inventory().fireArrow===0&&inventory().woodArrow===arrowAfter.woodArrow,'One actual shot must consume only the newly fused fire arrow and carry five-second burn');
 const bowAfter=lot('crudeBow');j.require(bowAfter.id===bowBefore.id&&bowAfter.durability===bowBefore.durability!-1,'Shot changed bow identity or wore it more than once');
 note('shield-and-projectile',{shieldBefore,fusedShield,arrowBefore,arrowAfter,afterShot:inventory(),shot,bowBefore,bowAfter});
 j.step(45);j.checkpoint('fusion-effects-consumed-once');

 j.stage='fusion-transfer-competition';
 j.act('drop','gear:'+fusedShield.id+':1');
 const shieldDrop=j.sim.adventure.state.resources.find(node=>node.drop&&node.kind==='shield'&&node.gearItems?.lots.some(item=>item.id===fusedShield.id));j.require(shieldDrop,'Paid fused shield drop is missing');
 j.act('gather',String(shieldDrop.id),undefined,b);refused(a,'gather',String(shieldDrop.id),'拾えるもの');
 const receivedShield=lot('shield',b);j.require(digest(receivedShield)===digest(fusedShield)&&!inventory().shield&&inventory(b).shield===1,'Competing pickup duplicated, lost or changed the fused shield');
 j.act('equip','gear:'+receivedShield.id,undefined,b);j.act('guard','on',undefined,b);j.act('guard','off',undefined,b);
 const materialBefore=inventory(b).stone??0;j.act('sky-unfuse','shield',undefined,b);const unfusedShield=lot('shield',b);identity(receivedShield,unfusedShield);
 j.require(!unfusedShield.fusion&&(inventory(b).stone??0)===materialBefore,'Unfusing must preserve the shield and not refund its material');
 j.act('drop','stone:1');
 const stoneDrop=j.sim.adventure.state.resources.find(node=>node.drop&&node.kind==='stone'&&node.amount===1);j.require(stoneDrop,'Shared stone transfer drop is missing');
 j.act('gather',String(stoneDrop.id),undefined,b);j.act('sky-fuse','shield:stone',undefined,b);
 const finalShield=lot('shield',b);j.require(finalShield.id===fusedShield.id&&finalShield.fusion?.durability===30&&inventory(b).stone===0,'Transferred shield re-fusion must spend exactly the transferred stone');
 note('fused-shield-transferred-and-refused',{dropId:shieldDrop.id,fusedShield,receivedShield,unfusedShield,finalShield,ownerBefore:a,ownerAfter:b});
 j.act('equip','club');
 const final=j.players.map(id=>({id,inventory:inventory(id),gear:structuredClone(j.actor(id).adventure.state.gearItems),equipment:j.actor(id).adventure.state.equipment,offhand:j.actor(id).adventure.state.meadows?.gear.offhand}));
 j.restart('fusion-paid-state-restart');j.step(6);
 const restored=j.players.map(id=>({id,inventory:inventory(id),gear:structuredClone(j.actor(id).adventure.state.gearItems),equipment:j.actor(id).adventure.state.equipment,offhand:j.actor(id).adventure.state.meadows?.gear.offhand}));
 j.require(digest(final)===digest(restored),'Save/restart changed earned inventory, equipment identities or effects');
 j.checkpoint('fusion-restored-state');note('save-restart-preserved',{before:final,after:restored});
 j.event('route-complete',{scope:'pristine-two-player-fusion-transactions',fixturesReplaced:false,expectedRejections:j.trace.filter(event=>event.kind==='action-rejected').length});j.flush();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const j=new ContinuousCoopJourney(process.env.FUSION_OUTPUT??'/tmp/voxel-fusion-source');
 try{fusionAcceptance(j);}catch(error){j.event('blocked',{message:String(error),stack:error instanceof Error?error.stack:undefined});j.flush();writeFileSync(resolve(j.output,'failure.txt'),String(error));process.exitCode=1;}
}
