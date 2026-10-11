/** Actual-input POWER-A02: earned motion history, competing recall operations,
 * and a second player physically obstructing a previously clear ascend exit. */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContinuousCoopJourney} from './playthrough-coop';
import {expectBridgeRejection} from './bridge-coop-acceptance';
const AIM={x:0,y:0,z:0};
export function powerContentionAcceptance(j:ContinuousCoopJourney):void {
 const [a,b]=j.players;
 const note=(name:string,data:Record<string,unknown>)=>j.event('power-contention-evidence',{name,...data});
 j.stage='recall-real-materials';j.step(30);
 const wood=j.sim.adventure.state.resources.find(node=>node.drop&&node.kind==='wood'&&node.amount===12);j.require(wood,'Missing real starting wood supply');j.act('gather',String(wood.id));
 j.pair(3,6);
 const beforeIds=new Set(j.sim.skybound.state.parts.map(part=>part.id));
 j.act('sky-part','beam:wood',{x:3,y:j.sim.groundAt(3,4)+2.5,z:4},a,AIM);
 const root=j.sim.skybound.state.parts.find(part=>!beforeIds.has(part.id));j.require(root,'Paid beam did not appear');
 j.act('sky-grab',String(root.id),undefined,a,AIM);
 j.act('sky-part','beam:wood',{x:root.position.x+2,y:root.position.y,z:root.position.z},a,AIM);
 const other=j.sim.skybound.state.parts.find(part=>part.creator===a&&part.id!==root.id);j.require(other,'Second paid beam did not appear');
 j.act('sky-glue',`${root.id}:${other.id}`,undefined,a,AIM);
 const ids=[root.id,other.id];
 j.act('sky-move',String(root.id),{...root.position,y:root.position.y+.75},a,AIM);
 j.act('sky-release',String(root.id),undefined,a,AIM);const released={...root.position};j.step(45);
 j.require(released.y-root.position.y>.5,'Recall must use genuine moving history, not a static fixture');
 note('paid-assembly-fell',{ids,released,settled:{...root.position},woodRemaining:j.actor(a).adventure.state.inventory.wood});
 j.checkpoint('power-real-motion-history');j.stage='recall-competing-actors';
 j.act('sky-recall',String(root.id),undefined,a,AIM);j.step(3);
 j.require(ids.every(id=>j.sim.skybound.snapshot(a).parts.find(part=>part.id===id)?.recalling),'Both paid parts must be in active recall');
 expectBridgeRejection(j,b,{type:'game-action',action:'sky-grab',id:String(root.id),aim:AIM},'別の冒険者');
 j.require(ids.every(id=>j.sim.skybound.snapshot(b).parts.find(part=>part.id===id)?.recalling),'Competing grab cancelled active recall');
 note('other-player-refused-during-recall',{ids,parts:j.sim.skybound.snapshot(b).parts.filter(part=>ids.includes(part.id))});
 expectBridgeRejection(j,a,{type:'game-action',action:'sky-grab',id:String(root.id),aim:AIM},'軌跡を戻している途中');
 for(let tick=0;tick<180&&j.sim.skybound.snapshot(a).parts.some(part=>ids.includes(part.id)&&part.recalling);tick++)j.step(1);
 j.require(ids.every(id=>!j.sim.skybound.snapshot(a).parts.find(part=>part.id===id)?.recalling),'Recall did not finish within its bounded history');
 j.act('sky-grab',String(root.id),undefined,b,AIM);j.act('sky-release',String(root.id),undefined,b,AIM);
 j.require(j.actor(a).adventure.state.inventory.wood===8,'Recall competition consumed paid materials');j.checkpoint('power-recall-contention-recovered');

 j.stage='ascend-physical-exit-obstruction';for(const player of j.players)j.act('return',undefined,undefined,player);
 j.pair(0,5);j.pair(-5,-10);j.act('trial-reset','825007');
 const base=j.sim.skybound.state.parts.filter(part=>part.trial===825007&&part.anchored).sort((x,y)=>x.position.y-y.position.y)[0];j.require(base,'Authored ascent trial has no floor');
 j.walk(base.position.x,base.position.z,b,900,.04);j.step(15);
 j.act('sky-ascend-preview',undefined,undefined,b,AIM);j.act('sky-ascend',undefined,undefined,b,AIM);
 j.walk(base.position.x+.8,base.position.z,b,180,.02);j.step(6);
 j.walk(base.position.x,base.position.z,a,900,.04);j.step(15);
 j.act('sky-ascend-preview',undefined,undefined,a,AIM);
 const preview=j.sim.skybound.snapshot(a).ascendPreview;j.require(preview,'Missing genuine clear exit preview');
 const before={player:{...j.actor(a).player},inventory:structuredClone(j.actor(a).adventure.state.inventory)},exit={...preview.exit};
 j.walk(exit.x,exit.z,b,80,.05);
 j.require(Math.hypot(j.actor(b).player.x-exit.x,j.actor(b).player.z-exit.z)<.65&&Math.abs(j.actor(b).player.y-exit.y)<1.7,'Other player did not physically occupy the previewed upper exit');
 note('exit-occupied-after-preview',{from:before.player,exit,blocker:{...j.actor(b).player},expiresTick:preview.expiresTick});
 expectBridgeRejection(j,a,{type:'game-action',action:'sky-ascend',aim:AIM},'出口が変わりました');
 j.require(Math.hypot(j.actor(a).player.x-before.player.x,j.actor(a).player.y-before.player.y,j.actor(a).player.z-before.player.z)<1e-6,'Rejected ascend moved the player through the occupied roof');
 j.require(JSON.stringify(j.actor(a).adventure.state.inventory)===JSON.stringify(before.inventory),'Rejected ascend consumed inventory');
 j.require(!j.sim.skybound.snapshot(a).ascendPreview,'Rejected preview was not cleared');j.checkpoint('power-occupied-ascend-exit-refused');
 j.walk(base.position.x+.8,base.position.z,b,80,.02);
 j.act('sky-ascend-preview',undefined,undefined,a,AIM);j.act('sky-ascend',undefined,undefined,a,AIM);j.step(12);
 j.require(j.actor(a).player.y>before.player.y+3&&j.actor(a).player.grounded,'Clear exit could not be used after obstruction removal');
 note('exit-cleared-and-ascended',{from:before.player,exit,arrived:{...j.actor(a).player},blockerAside:{...j.actor(b).player}});
 j.restart('power-contention-save-restart');j.event('route-complete',{scope:'actual-input-recall-contention-and-occupied-ascend-exit',fixturesReplaced:false,expectedRejections:3});j.flush();
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const j=new ContinuousCoopJourney(process.env.POWER_CONTENTION_OUTPUT??'/tmp/voxel-power-contention-source');
 try{powerContentionAcceptance(j);}catch(error){j.event('blocked',{message:String(error),stack:error instanceof Error?error.stack:undefined,players:j.players.map(id=>({id,player:{...j.actor(id).player}}))});j.flush();writeFileSync(resolve(j.output,'failure.txt'),String(error));process.exitCode=1;}
}
