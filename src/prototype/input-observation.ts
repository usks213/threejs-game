import type {Vec3} from './core/voxel';
interface ObservedActor {position:Vec3;hp:number;phase:string;time:number}
interface InputObservationSource {seconds:number;player:ObservedActor&{stamina:number;yaw:number;pitch:number};enemies:readonly ObservedActor[]}
/** Read-only test telemetry: no raycasts, field reads, save snapshots or live references. */
export function inputObservation(source:InputObservationSource){
 const p=source.player;
 return {position:{...p.position},hp:p.hp,stamina:p.stamina,phase:p.phase,seconds:source.seconds,yaw:p.yaw,pitch:p.pitch,enemies:source.enemies.map(e=>({position:{...e.position},hp:e.hp,phase:e.phase,time:e.time}))};
}
