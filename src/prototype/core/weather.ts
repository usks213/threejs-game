import {regionAt} from './regions';
import type {VoxelField,Vec3} from './voxel';
import type {ElementSystem} from './elements';
import type {EntityElements} from './entity-elements';
import type {MaterialDrop} from './survival';

export type WeatherKind='clear'|'rain'|'wind'|'fog'|'snow';
export interface WeatherState {kind:WeatherKind;label:string;wind:Vec3;rain:boolean}
/** The saved world clock is the only schedule input. No wall-clock catch-up or
 * random storm damage. The first hour of a new journey remains clear. */
export function weatherAt(day:number,hour:number,position:Vec3):WeatherState {
 const time=Number.isFinite(day)&&Number.isFinite(hour)?Math.max(0,day)*24+hour:10;
 const phase=((Math.floor(time)%8)+8)%8;
 let kind:WeatherKind=phase===3||phase===4?'rain':phase===5?'wind':phase===7?'fog':'clear';
 const climate=regionAt(position)?.climate;
 if(kind==='rain'&&climate==='freezing')kind='snow';
 if(kind==='rain'&&(climate==='arid'||climate==='ash'))kind='wind';
 const speed=kind==='wind'?2.5:kind==='rain'?1.1:.25,angle=Math.floor(time/8)*1.37+.6;
 return {kind,label:{clear:'晴れ',rain:'雨 · 屋外の火を鎮める',wind:'風 · 滑空と軽い素材が流される',fog:'朝霧',snow:'雪'}[kind],wind:{x:Math.cos(angle)*speed,y:0,z:Math.sin(angle)*speed},rain:kind==='rain'};
}
export function exposedToSky(field:VoxelField,position:Vec3){return !field.ray({x:position.x,y:position.y+.18,z:position.z},{x:0,y:1,z:0},24);}
export interface WeatherActor {position:Vec3;hp:number;body:EntityElements;active:boolean}
/** At most 16 roof rays per half-second. Only nearby active actors, existing
 * element states and resident drops participate; unloaded terrain is untouched. */
export class WeatherReactions {
 private bucket=-1;private fireCursor=0;private actorCursor=0;private dropCursor=0;
 lastRayCount=0;
 due(seconds:number){return Number.isFinite(seconds)&&seconds>=0&&Math.floor(seconds*2)!==this.bucket;}
 tick(seconds:number,day:number,hour:number,field:VoxelField,elements:ElementSystem,actors:readonly WeatherActor[],drops:readonly MaterialDrop[],centers:readonly Vec3[]){
  if(!Number.isFinite(seconds)||seconds<0)return;
  const bucket=Math.floor(seconds*2);if(bucket===this.bucket)return;this.bucket=bucket;this.lastRayCount=0;
  const near=(p:Vec3)=>centers.some(c=>Math.hypot(c.x-p.x,c.z-p.z)<24);
  const exposed=(p:Vec3)=>{this.lastRayCount++;return exposedToSky(field,p);};
  const states=[...elements.states.values()];
  for(let i=0;i<Math.min(8,states.length);i++){const state=states[this.fireCursor++%states.length];if(!near(state.position)||!weatherAt(day,hour,state.position).rain||!exposed(state.position))continue;state.fire=0;state.wet=Math.max(state.wet,2);}
  for(let i=0;i<Math.min(4,actors.length);i++){const actor=actors[this.actorCursor++%actors.length];if(!actor.active||actor.hp<=0||!near(actor.position)||!weatherAt(day,hour,actor.position).rain||!exposed({...actor.position,y:actor.position.y+1.7}))continue;
   actor.body.wet=Math.max(actor.body.wet,2);actor.body.burning=0;for(const state of actor.body.reactions.states.values()){state.fire=0;state.wet=Math.max(state.wet,2);}
  }
  for(let i=0;i<Math.min(4,drops.length);i++){const drop=drops[this.dropCursor++%drops.length];if(!near(drop.position))continue;const weather=weatherAt(day,hour,drop.position);if((!weather.rain&&weather.kind!=='wind')||!exposed(drop.position))continue;
   if(weather.rain){drop.fire=0;drop.wet=Math.max(drop.wet??0,2);}
   // A half-second impulse, not teleportation; the existing swept-body solver
   // handles collisions and drag. Heavy metal/stone move less than wood/fibre.
   const mass=drop.material===6?3:drop.material===3?2:1,v=drop.velocity??(drop.velocity={x:0,y:0,z:0});
   v.x=Math.max(-3,Math.min(3,v.x+weather.wind.x*.12/mass));v.z=Math.max(-3,Math.min(3,v.z+weather.wind.z*.12/mass));
  }
 }
}
