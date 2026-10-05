import type {Adventure} from '../adventure';
import type {Projectile} from '../types';
import type {Vec3} from '../../world/types';
import {planItemDrops,commitItemDrops,DROP_LIMIT} from '../interaction/drops';
export function preflightGearThrow(game:Adventure,kind:string):void{
 if((game.state.gearFlights?.length??0)>=64)throw Error('投擲中の装備が上限です。回収を待ってください');
 const lot=game.gear.selected(kind);if(!lot)throw Error('投げる装備がありません');
 const ids=game.sim.reserveEntityIds(2);for(let n=0;n<(lot.count>1?2:1);n++)ids.allocate();
}
export function throwGear(game:Adventure,kind:string,point:Vec3):number{
 const ids=game.sim.reserveEntityIds(1),transfer=game.gear.extract(kind,1,ids.allocate),id=ids.allocate();ids.commit();game.gear.commit(transfer.personal);
 game.state.gearFlights??=[];game.state.gearFlights.push({id,point:{...point},gearItems:transfer.cargo});return id;
}
function bounded(game:Adventure,point:Vec3):Vec3{const b=game.sim.world.bounds;return{x:Math.max(b.minX+1,Math.min(b.maxX-1,point.x)),y:Math.max(b.minY+1,Math.min(b.maxY-1,point.y)),z:Math.max(b.minZ+1,Math.min(b.maxZ-1,point.z))};}
export function updateGearFlight(game:Adventure,shot:Projectile):void{const flight=game.state.gearFlights?.find(f=>f.id===shot.gearFlight);if(flight)flight.point=bounded(game,shot);}
export function landGearFlight(game:Adventure,id:number):boolean{
 const flight=game.state.gearFlights?.find(f=>f.id===id);if(!flight)return true;
 if(game.state.resources.length>=DROP_LIMIT)return false;
 const lot=flight.gearItems.lots[0],point=bounded(game,flight.point);let used=false;
 const resources=planItemDrops(game,lot.kind,1,point,()=>{if(used)throw Error('投擲装備の個数が不正です');used=true;return id;},flight.gearItems);
 commitItemDrops(game,resources);game.state.gearFlights=game.state.gearFlights!.filter(f=>f.id!==id);return true;
}
/** A saved or disconnected projectile never owns an item outside the durable holder list. */
export function recoverGearFlights(game:Adventure):void{const active=new Set(game.projectiles.flatMap(p=>p.gearFlight===undefined?[]:[p.gearFlight]));for(const flight of [...(game.state.gearFlights??[])])if(!active.has(flight.id))landGearFlight(game,flight.id);}
