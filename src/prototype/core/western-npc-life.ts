import {record} from '../../save/validation';
import {NpcLife,validNpcLifeState,type NpcLifeContext,type NpcLifeProfile,type NpcLifeState} from './npc-life';
import {WEST_SPECIALISTS} from './expedition-west';
import type {WestExpeditionSystem} from './expedition-west-integration';

export type WesternNpcId='west-carpenter'|'west-alchemist';
export interface WesternNpcLifeState {version:1;actors:Record<WesternNpcId,NpcLifeState|null>}
/** Additive actor profiles; the certified static authoring functions are untouched. */
export const WEST_NPC_PROFILES:readonly NpcLifeProfile[]=WEST_SPECIALISTS.map((npc,index)=>({
 id:npc.id,name:npc.name,viewName:npc.id+'-life',home:{...npc.homePosition},safeFallback:{x:-49.25,y:.77,z:-12.25},
 bed:{x:-50.75,y:1.2,z:index===0?-11.75:-13.75},work:{x:-48.75,y:.77,z:index===0?-11.75:-13.75},social:{x:-46.75,y:.77,z:index===0?-11.75:-13.75},
 bedObject:'build:home:'+npc.id+'-bed',bedFurniture:npc.id+'-bed',bounds:{minX:-51.25,maxX:-45.75,minZ:-15.25,maxZ:-10.25},floorTop:1.78,
 workLabel:index===0?'荷場で木枠の手入れ':'荷場で薬瓶の調律',socialLabel:'荷場の庭で交流',
 dialogue:(index===0?'朝と午後は木枠を手入れし、昼と夕方は庭で過ごす。':'朝と午後は薬瓶を調律し、昼と夕方は庭で過ごす。')+npc.dialogue,role:index===0?'carpenter':'alchemist',
}));
export function validWesternNpcLifeState(value:unknown):value is WesternNpcLifeState {
 if(!record(value)||Object.keys(value).length!==2||value.version!==1||!record(value.actors)||Object.keys(value.actors).length!==2)return false;
 const actors=value.actors;return WEST_NPC_PROFILES.every(profile=>Object.hasOwn(actors,profile.id)&&(actors[profile.id]===null||validNpcLifeState(actors[profile.id],profile)));
}
/** Shared controller, distinct owned SDF bodies. Rescue/rewards remain in WestExpeditionSystem. */
export class WesternNpcLife {
 readonly actors=WEST_NPC_PROFILES.map(profile=>new NpcLife(profile));
 get(id:string){return this.actors.find(actor=>actor.profile.id===id);}
 snapshot():WesternNpcLifeState{return {version:1,actors:Object.fromEntries(this.actors.map(actor=>[actor.profile.id,actor.snapshot()])) as WesternNpcLifeState['actors']};}
 restore(value:unknown){if(!validWesternNpcLifeState(value))return false;for(const actor of this.actors)actor.restore(value.actors[actor.profile.id as WesternNpcId]);return true;}
 reconcile(western:WestExpeditionSystem|null,context:(actor:NpcLife)=>NpcLifeContext){const claimed=western?.snapshot().claimed??[];for(const actor of this.actors)actor.reconcile(claimed.includes(actor.profile.id),context(actor));}
 tick(dt:number,context:(actor:NpcLife)=>NpcLifeContext){for(const actor of this.actors)actor.tick(dt,context(actor));}
}
