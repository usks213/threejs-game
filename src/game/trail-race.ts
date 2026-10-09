import type {Adventure} from './adventure';
import type {GameSimulation} from '../simulation/game-simulation';
import type {Vec3} from '../world/types';
export interface TrailRaceSave {best?:number;finishes:number;run?:{started:number;next:number;previous:Vec3};message?:'finished'|'expired'|'cancelled'}
export const RACE_ROUTE=[[-8,14],[-8,4],[0,0],[5,4],[5,14],[0,14]] as const;
export function raceGates(sim:GameSimulation):Vec3[]{return RACE_ROUTE.map(([x,z])=>({x,y:sim.groundAt(x,z,3),z}));}
export function validateRace(raw:unknown):TrailRaceSave{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('競走記録が不正です');const r=raw as TrailRaceSave;
 if(!Number.isSafeInteger(r.finishes)||r.finishes<0||r.finishes>1000000||r.best!==undefined&&(!Number.isFinite(r.best)||r.best<=0||r.best>90)||r.message!==undefined&&!['finished','expired','cancelled'].includes(r.message))throw Error('競走記録が不正です');
 if(r.run&&(!Number.isFinite(r.run.started)||r.run.started<0||r.run.started>1e10||!Number.isInteger(r.run.next)||r.run.next<0||r.run.next>=RACE_ROUTE.length||!r.run.previous||!['x','y','z'].every(k=>Number.isFinite(r.run!.previous[k as keyof Vec3])&&Math.abs(r.run!.previous[k as keyof Vec3])<1024)))throw Error('競走の途中記録が不正です');
 return {finishes:r.finishes,...(r.best!==undefined?{best:r.best}:{}),...(r.message?{message:r.message}:{}),...(r.run?{run:{started:r.run.started,next:r.run.next,previous:{x:r.run.previous.x,y:r.run.previous.y,z:r.run.previous.z}}}:{})};
}
export class TrailRace{
 constructor(private readonly game:Adventure){}
 action(id:string):string{
  const s=this.game.state,r=s.race??={finishes:0};if(id==='cancel'){delete r.run;r.message='cancelled';return '競走を終了しました';}
  if(id!=='start')throw Error('競走の開始か終了を選んでください');const npc=s.resources.find(n=>n.id===830001),p=this.game.sim.player;
  if(!npc||Math.hypot(p.x-npc.x,p.y-npc.y,p.z-npc.z)>4)throw Error('地表の案内人キリへ近づいてください');if(!p.grounded)throw Error('地面に立って開始してください');
  r.run={started:s.seconds,next:0,previous:{x:p.x,y:p.y,z:p.z}};delete r.message;return '風原の便り競走。光の門を順に6つ通り、90秒以内で一周しよう';
 }
 step(dt:number):void{
  const s=this.game.state,r=s.race,run=r?.run;if(!r||!run)return;const sim=this.game.sim,p=sim.player,elapsed=s.seconds-run.started;
  if(elapsed>90){delete r.run;r.message='expired';return;}
  if(s.health<=0||Math.hypot(p.x-run.previous.x,p.y-run.previous.y,p.z-run.previous.z)>Math.max(2,dt*30)||sim.companions.isRiding(this.game.owner)||sim.skybound.isRiding(this.game.owner)){delete r.run;r.message='cancelled';return;}
  run.previous={x:p.x,y:p.y,z:p.z};const gate=raceGates(sim)[run.next];if(Math.hypot(p.x-gate.x,p.y-gate.y,p.z-gate.z)>1.7)return;
  run.next++;if(run.next<RACE_ROUTE.length)return;const time=Math.max(.01,elapsed);r.best=Math.min(r.best??90,time);r.finishes=Math.min(1000000,r.finishes+1);delete r.run;r.message='finished';
 }
}
