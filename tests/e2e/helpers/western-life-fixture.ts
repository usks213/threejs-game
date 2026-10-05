import {CoreSimulation} from '../../../src/prototype/core/simulation';
import {WEST_RUNTIME_ENEMIES} from '../../../src/prototype/core/expedition-west-integration';
import {captureCampaign,createCampaignStore,defaultSettings,WESTERN_CAMPAIGN_STORE_KEY} from '../../../src/prototype/campaign-session';
import {executeGameCommand} from '../../../src/prototype/campaign-commands';
/** Seeded visual/regression fixture only. Normal rescue/progression evidence is in
 * west-specialists-normal-play.test.ts; this fixture must never be labelled as it. */
export function westernLifeFixture(sleep=false){
 const s=new CoreSimulation(true,false,true,true),west=s.western!;Object.assign(s.campaign.state,{flameTier:2,artisanRescued:true,gateOpen:true,campUnlocked:true,unlockedRegions:['hearthfield','resinwood'],completed:['ridge']});for(const enemy of s.enemies){enemy.hp=0;enemy.phase='dead';}
 s.player.position={x:-47.2,y:.77,z:-14.5};const actor={authority:'host' as const,alive:true,position:s.player.position};
 for(const enemy of WEST_RUNTIME_ENEMIES)if(!west.defeat(enemy.key,{slot:enemy.slot,hp:0},actor).ok)throw Error('Western fixture defeat failed');
 for(const id of ['west-hamlet-cache','west-return-hearth','west-mine-switch','west-carpenter','west-alchemist']){const p=west.pointPosition(id)!,mine=id==='west-mine-switch'||id==='west-alchemist';if(!west.interact(id,{...actor,position:{x:p.x+(mine?.9:0),y:p.y+.1,z:p.z+(mine?0:1.15)}}).ok)throw Error('Western fixture claim failed: '+id);s.reconcileNpc();}
 const advance=(hour:number)=>{s.worldHour=hour;for(let i=0;i<900;i++)s.westNpcs.tick(1/30,a=>({...s.npcContextFor(a),rain:false}));};
 if(sleep){advance(12);s.survival.inventory[4]=30;s.survival.inventory[10]=15;for(const a of s.westNpcs.actors)if(!executeGameCommand(s,{type:'homestead',id:'furniture:'+a.profile.bedFurniture}).ok)throw Error('Western fixture bed failed');advance(23);s.player.position={x:-49,y:.77,z:-12.5};}else s.worldHour=10;
 const a=s.westNpcs.actors[0],p=s.player.position;s.player.yaw=Math.atan2(p.x-a.position.x,p.z-a.position.z);s.player.pitch=Math.atan2(a.position.y+1-p.y-1.52,Math.hypot(a.position.x-p.x,a.position.z-p.z));
 const map=new Map<string,string>(),storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);},removeItem:(key:string)=>{map.delete(key);}},settings=defaultSettings();settings.graphics='performance';const result=createCampaignStore(true,storage,true).write(captureCampaign(s,settings));if(!result.ok)throw Error(result.error);return map.get(WESTERN_CAMPAIGN_STORE_KEY)!;
}
