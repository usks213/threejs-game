/** Optional actual-input continuation from an earned final-goal save.
 * This is SessionAuthority evidence until separately replayed over sockets. */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContinuousCoopJourney} from './playthrough-coop';

export function continueEpilogue(j:ContinuousCoopJourney):void {
 const [a,b]=j.players;
 if(!j.sim.adventure.state.defeated.includes('stormcore')||j.sim.adventure.state.siteWorld?.regional?.reported.length!==3)throw Error('Resume an earned ending with all three regional reports');
 const collect=(kind:string)=>{
  const p=j.actor(a).player,node=j.sim.adventure.state.resources.filter(n=>n.drop&&n.kind===kind&&n.amount>0&&Math.hypot(n.x-p.x,n.y-p.y,n.z-p.z)<3.5).sort((x,y)=>Math.hypot(x.x-p.x,x.z-p.z)-Math.hypot(y.x-p.x,y.z-p.z))[0];
  if(!node)throw Error(`No earned ${kind} drop in reach`);j.act('gather',String(node.id));
 };
 const fightNearby=()=>{for(let i=0;i<3;i++){const p=j.actor(a).player,enemy=j.sim.adventure.state.enemies.find(e=>e.health>0&&!e.boss&&Math.hypot(e.x-p.x,e.y-p.y,e.z-p.z)<7);if(!enemy)return;j.fight(enemy.definition,enemy.id);}};
 j.stage='epilogue-supplies';j.leave(b);j.act('equip','club');j.act('equip','ragTunic');if(!j.actor(a).adventure.state.meadows!.foods.some(food=>food.id==='berry'))j.act('eat','berry');
 if(j.actor(a).player.y<20){j.act('return');j.pair(0,20);j.pair(18,20);j.pair(18,28);j.pair(35,28);j.pair(39,23);j.step(1,{[a]:{x:0,z:0,jump:true}});j.act('glide');for(let tick=0;tick<240&&j.actor(a).player.y<=20;tick++)j.step(1);j.act('glide','off');j.message(a,{type:'game-action',action:'sky-ascend-preview',aim:{x:0,y:0,z:-1}},4);j.message(a,{type:'game-action',action:'sky-ascend',aim:{x:0,y:0,z:-1}},4);fightNearby();j.pair(48,27);}collect('crystal');j.act('equip','club');if(!j.sim.skybound.fusion(a,'club'))j.act('sky-fuse','club:crystal');if(!j.actor(a).adventure.state.meadows!.foods.some(food=>food.id==='berry'))j.act('eat','berry');
 j.act('return');j.pair(18,10);j.pair(18,-25);j.pair(24,-26.5);fightNearby();j.pair(24,-26.5);collect('coins');
 while((j.actor(a).adventure.state.inventory.wood??0)<8)j.act('trade','buy:wood');j.act('chronicle-epilogue','850001');collect('coins');
 for(const [kind,needed]of [['wood',3],['stone',14],['resin',2]]as const)while((j.actor(a).adventure.state.inventory[kind]??0)<needed)j.act('trade','buy:'+kind);
 j.act('craft','hammer');j.checkpoint('surface-epilogue');
 j.stage='depth-epilogue';j.act('return');j.step(10);j.act('travel','beacon:810003');j.pair(12,8);j.pair(-6,0);j.pair(-18,-6.5);fightNearby();j.pair(-18,-6.5);j.act('chronicle-epilogue','850002');j.checkpoint('depth-epilogue');
 j.stage='sky-epilogue';j.act('return');j.step(10);j.act('travel','beacon:810002');j.pair(10,-15);j.step(20);j.step(1,{[a]:{x:0,z:0,jump:true}});j.act('glide');
 for(let tick=0;tick<240&&j.actor(a).player.y<=43.5;tick++)j.step(1);
 if(j.actor(a).player.y<=43.5)throw Error('Updraft did not reach the sky route');
 j.pair(-22,-24.5);for(let tick=0;tick<400&&!j.actor(a).player.grounded;tick++)j.step(1);if(j.actor(a).adventure.traversal.gliding)j.act('glide','off');j.pair(-22,-24.5);j.act('chronicle-epilogue','850003');
 if(j.sim.adventure.state.siteWorld!.regional!.epilogue.length!==3)throw Error('All three commissions must be earned');j.checkpoint('three-epilogue-commissions');
 j.stage='place-earned-monument';j.act('return');j.pair(3,8);const ids=new Set(j.sim.adventure.state.buildings.map(building=>building.id));j.act('build','routeMonument',{x:5,y:j.sim.groundAt(5,10),z:10});j.step(90);
 const monument=j.sim.adventure.state.buildings.find(building=>!ids.has(building.id)&&building.definition==='routeMonument'&&building.creator===a);if(!monument)throw Error('Placed monument did not remain supported');
 j.rejoin(b);j.step(6);for(const id of j.players)if(!j.room.view(id).adventure.progressionView?.decorations.includes('routeMonument'))throw Error('Shared monument unlock missing for '+id);
 j.restart('epilogue-and-monument');if(!j.sim.adventure.state.buildings.some(building=>building.id===monument.id))throw Error('Monument missing after save/restart');
 j.event('route-complete',{scope:'earned-ending-epilogue-continuation',commissions:[...j.sim.adventure.state.siteWorld!.regional!.epilogue],monument:monument.id,party:j.players});j.flush();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.env.JOURNEY_RESUME)throw Error('Supply JOURNEY_RESUME pointing to an earned final-goal save');
 const journey=new ContinuousCoopJourney(process.env.JOURNEY_OUTPUT??'/tmp/voxel-coop-epilogue',process.env.JOURNEY_RESUME);
 try{continueEpilogue(journey);}catch(error){journey.event('blocked',{message:String(error),players:journey.players.filter(id=>journey.room.actors.has(id)).map(id=>({id,player:{...journey.actor(id).player},health:journey.actor(id).adventure.state.health}))});journey.flush();process.exitCode=1;}
}
