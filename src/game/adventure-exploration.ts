import type {GameSimulation} from '../simulation/game-simulation';
import type {AdventureSave,EnemyState} from './types';
import type {Vec3} from '../world/types';
import {finiteVec,insideBounds} from '../world/types';
import {skyboundLayer,SKY_ISLANDS} from '../world/skybound-terrain';
import {adventureRegion} from '../environment/adventure';
import {REGION_RESOURCES,REGION_ENEMIES} from '../content/adventure-encounters';
import {ENEMIES} from '../content/catalog';
import {skyContext} from './skybound/context';
import {protectedVolumes,intersectsProtection} from './skybound/protection';
import {SITES} from '../content/adventure-sites';
import {sees} from './meadows/obstacles';
export interface ExplorationState {waterPaused?:boolean;version:1;tiles:string[];pending:string[];generated:number;exhausted:boolean;waterJobs:{x:number;z:number;column:number;legacy?:boolean}[]}
export interface ExplorationStatus {waterPaused?:boolean;visited:number;pending:number;generated:number;exhausted:boolean}
export const EXPLORATION_LIMITS={resources:6000,enemies:256,tiles:12000,pending:128,resourcesPerTile:8,enemiesPerTile:2,waterColumns:16,naturalWaterCells:32768} as const;
const tilePattern=/^(surface|depths|sky):(-?\d+),(-?\d+)$/;
const tileValid=(id:unknown)=>typeof id==='string'&&!!tilePattern.exec(id)&&id.split(':')[1].split(',').every(n=>Number(n)>=-30&&Number(n)<=30&&String(Number(n))===n);
export function validateExploration(raw:unknown):ExplorationState{
 if(!raw||typeof raw!=='object')throw Error('探索生成の保存が不正です');const e=raw as ExplorationState;const ids=(v:unknown,max:number):v is string[]=>Array.isArray(v)&&v.length<=max&&new Set(v).size===v.length&&v.every(tileValid);
 if(e.waterPaused!==undefined&&typeof e.waterPaused!=='boolean'||e.version!==1||!ids(e.tiles,EXPLORATION_LIMITS.tiles)||!ids(e.pending,EXPLORATION_LIMITS.pending)||!Number.isInteger(e.generated)||e.generated<0||e.generated>EXPLORATION_LIMITS.resources||typeof e.exhausted!=='boolean'||!Array.isArray(e.waterJobs)||e.waterJobs.length>3481||e.waterJobs.some(j=>!j||!Number.isInteger(j.x)||!Number.isInteger(j.z)||Math.abs(j.x)>30||Math.abs(j.z)>30||!Number.isInteger(j.column)||j.column<0||j.column>=4096||j.legacy!==undefined&&typeof j.legacy!=='boolean')||new Set(e.waterJobs.map(j=>j.x+','+j.z)).size!==e.waterJobs.length)throw Error('探索生成の状態が不正です');return {version:1,...(e.waterPaused?{waterPaused:true}:{}),tiles:[...e.tiles],pending:[...e.pending],generated:e.generated,exhausted:e.exhausted,waterJobs:e.waterJobs.map(j=>({x:j.x,z:j.z,column:j.column,...(j.legacy?{legacy:true}:{})}))};
}
export function explorationStatus(state:AdventureSave):ExplorationStatus{const e=state.exploration;return {waterPaused:e?.waterPaused??false,visited:e?.tiles.length??0,pending:e?.pending.length??0,generated:e?.generated??0,exhausted:e?.exhausted??false};}
function stateFor(s:AdventureSave):ExplorationState{
 if(!s.exploration){const old=s.meadows?.worldTiles??[];s.exploration={version:1,tiles:[...new Set(old.filter(id=>tileValid('surface:'+id)).map(id=>'surface:'+id))],pending:[],generated:Math.min(EXPLORATION_LIMITS.resources,s.resources.filter(n=>!n.drop).length),exhausted:false,waterJobs:(s.meadows?.pendingWaterTiles??[]).map(j=>({...j,legacy:true}))};if(s.meadows)s.meadows.pendingWaterTiles=[];}return s.exploration;
}
const scheduled=new WeakMap<GameSimulation,number>();
export function adventureSurface(sim:GameSimulation,layer:string,x:number,z:number):number|undefined{
 const island=layer==='sky'?SKY_ISLANDS.find(i=>Math.hypot(i.x-x,i.z-z)<i.radius-1):undefined;if(layer==='sky'&&!island)return undefined;
 const near=layer==='depths'?-10.5:island?.y??sim.world.heightAt(x,z),y=sim.groundAt(x,z,near);if(skyboundLayer(y)!==layer||!insideBounds({x,y,z},sim.world.bounds,1))return undefined;return y;
}
export function makeAdventureEnemy(sim:GameSimulation,definition:string,p:Vec3):EnemyState{const def=ENEMIES.find(d=>d.id===definition);if(!def)throw Error('敵の定義がありません');const y=p.y+(definition==='veilray'?2:0);return {id:sim.allocateEntityId(),definition,x:p.x,y,z:p.z,homeX:p.x,homeY:y,homeZ:p.z,tier:1,health:def.health,cooldown:2,windup:0,slow:0,boss:false,heading:0};}
/** One persisted tile transaction per authority tick, shared across all visiting actors. */
export function populateAdventureTiles(sim:GameSimulation,s:AdventureSave,p:Vec3):void{
 if(sim.world.generator!==4||!finiteVec(p))return;const e=stateFor(s),known=new Set(e.tiles),queued=new Set(e.pending),layer=skyboundLayer(p.y),cx=Math.floor(p.x/32),cz=Math.floor(p.z/32);
 for(const [dx,dz]of[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){const id=layer+':'+(cx+dx)+','+(cz+dz);if(!tileValid(id)||known.has(id)||queued.has(id)||e.pending.length>=EXPLORATION_LIMITS.pending)continue;e.pending.push(id);queued.add(id);}
 if(scheduled.get(sim)===sim.tick||!e.pending.length)return;scheduled.set(sim,sim.tick);
 if(e.tiles.length>=EXPLORATION_LIMITS.tiles){e.exhausted=true;e.pending=[];return;}
 const id=e.pending.shift()!;if(known.has(id))return;const [stratum,coordinates]=id.split(':'),[tx,tz]=coordinates.split(',').map(Number),random=(i:number)=>{let h=Math.imul(tx+5317,374761393)^Math.imul(tz,668265263)^Math.imul(i+stratum.length,1442695041)^sim.world.bounds.seed;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;};
 const ctx=skyContext(sim),actors=ctx.actors,protectedAreas=protectedVolumes(sim);const free=(point:Vec3,enemy=false)=>!intersectsProtection(point,enemy?10:2,protectedAreas)&&!SITES.some(site=>Math.hypot(site.x-point.x,site.z-point.z)<10&&Math.abs((s.siteWorld?.bases[site.id]??site.y??2)-point.y)<5)&&!sim.world.edits.some(edit=>Math.hypot(edit.position.x-point.x,edit.position.y-point.y,edit.position.z-point.z)<edit.radius+1)&&[.2,.8,1.5].every(y=>!ctx.solid({...point,y:point.y+y})&&!ctx.occupied?.({...point,y:point.y+y}))&&actors.every(a=>{const d=Math.hypot(a.position.x-point.x,a.position.y-point.y,a.position.z-point.z);return d>(enemy?18:3)&&(!enemy||d>35||!sees(sim,point,a.position));})&&!sim.skybound.state.parts.some(part=>Math.hypot(part.position.x-point.x,part.position.y-point.y,part.position.z-point.z)<3);
 for(let i=0;i<EXPLORATION_LIMITS.resourcesPerTile&&e.generated<EXPLORATION_LIMITS.resources;i++){if(s.resources.length>=EXPLORATION_LIMITS.resources){e.exhausted=true;break;}const x=tx*32+2+random(i*2)*28,z=tz*32+2+random(i*2+1)*28,y=adventureSurface(sim,stratum,x,z);if(y===undefined||!free({x,y,z})||s.resources.some(n=>n.ready<=s.seconds&&Math.hypot(n.x-x,n.y-y,n.z-z)<2))continue;const region=adventureRegion({x,y,z}),kind=REGION_RESOURCES[region][i%REGION_RESOURCES[region].length];s.resources.push({id:sim.allocateEntityId(),kind,x,y,z,amount:['stone','branch','iron','copper'].includes(kind)?3:1,ready:0});e.generated++;}
 for(let i=0;i<EXPLORATION_LIMITS.enemiesPerTile&&s.enemies.length<EXPLORATION_LIMITS.enemies;i++){const x=tx*32+4+random(60+i*2)*24,z=tz*32+4+random(61+i*2)*24,y=adventureSurface(sim,stratum,x,z);if(y===undefined||!free({x,y,z},true)||s.enemies.some(n=>Math.hypot(n.x-x,n.y-y,n.z-z)<5))continue;const kinds=REGION_ENEMIES[adventureRegion({x,y,z})],kind=kinds[Math.floor(random(90+i)*kinds.length)];if(kind==='veilray'&&!free({x,y:y+2,z},true))continue;s.enemies.push(makeAdventureEnemy(sim,kind,{x,y,z}));}
 const center={x:tx*32+16,y:sim.world.heightAt(tx*32+16,tz*32+16),z:tz*32+16};if(stratum==='surface'&&adventureRegion(center)==='shore'&&e.waterJobs.length<128&&!e.waterJobs.some(j=>j.x===tx&&j.z===tz))e.waterJobs.push({x:tx,z:tz,column:0});
 e.tiles.push(id);if(e.generated>=EXPLORATION_LIMITS.resources)e.exhausted=true;
}
export function advanceAdventureWater(sim:GameSimulation,s:AdventureSave):number{
 if(sim.world.generator!==4||!s.exploration)return 0;const jobs=s.exploration.waterJobs;s.exploration.waterPaused=false;let count=0;while(jobs.length&&count<EXPLORATION_LIMITS.waterColumns){if(!jobs[0].legacy&&sim.fluid.cells.size>=EXPLORATION_LIMITS.naturalWaterCells-8){s.exploration.waterPaused=true;break;}const j=jobs[0],x=j.x*32+Math.floor(j.column/64)*.5,z=j.z*32+(j.column%64)*.5,ground=sim.groundAt(x+.25,z+.25,sim.world.heightAt(x+.25,z+.25));if((j.legacy||skyboundLayer(ground)==='surface')&&ground<-.1)for(let y=Math.max(j.legacy?-5:-3,Math.ceil(ground*2)/2);y<0;y+=.5)sim.fluid.add({x,y,z},.12);count++;j.column++;if(j.column===4096)jobs.shift();}return count;
}
