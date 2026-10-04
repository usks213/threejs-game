import type { Adventure } from '../adventure';
import type { EnemyState } from '../types';
import { sees,reconcileCreature } from './obstacles';
export function senseActor(game:Adventure,e:EnemyState,target:Adventure,p:{x:number;y:number;z:number},dt:number):boolean{
 const m=target.state.meadows!,d=Math.hypot(p.x-e.x,p.z-e.z),wind=Math.sin(game.state.seconds/60),scent=(Math.sin(wind)*(e.x-p.x)+Math.cos(wind)*(e.z-p.z))/Math.max(.01,d);
 const visible=d<(m.sneaking?5*(1-(m.skills.sneak??0)*.004):12)&&sees(game.sim,e,p);
 const noisy=target.attack>0&&d<16||m.exerting&&!m.sneaking&&d<9;
 const smelled=e.definition==='deer'&&scent>.6&&d<14;
 e.alerted=visible||noisy||smelled?8:Math.max(0,(e.alerted??0)-dt);return e.alerted>0;
}
export function wander(game:Adventure,e:EnemyState,speed:number,dt:number):void{
 const t=Math.floor(game.state.seconds/7),angle=e.id*2.399+t*1.77;
 if((t+e.id)%3===0)return;
 const tx=e.homeX+Math.sin(angle)*4,tz=e.homeZ+Math.cos(angle)*4,d=Math.hypot(tx-e.x,tz-e.z);if(d<.3)return;
 const previous={x:e.x,y:e.y,z:e.z};e.x+=(tx-e.x)/d*speed*.25*dt;e.z+=(tz-e.z)/d*speed*.25*dt;e.heading=Math.atan2(tx-e.x,tz-e.z);reconcileCreature(game.sim,e,previous);
}
