import { BUILDINGS as importedBuildings } from '../content/catalog';
import type { BuildingDefinition } from '../content/catalog';
import type { BuildingState } from './types';
import type { Vec3 } from '../world/types';
export function placementPoint(point:Vec3):Vec3 { return {x:Math.round(point.x),y:Math.round(point.y*2)/2,z:Math.round(point.z)}; }
export function placementIssue(def:BuildingDefinition,p:Vec3,at:Vec3,buildings:BuildingState[],inventory:Record<string,number>):string {
 if(Math.hypot(at.x-p.x,at.z-p.z)>7)return 'もっと近くに設置';
 if(Math.hypot(at.x-p.x,at.z-p.z)<1.1&&Math.abs(at.y-p.y)<1.8)return '自分から少し離す';
 if(buildings.some(b=>Math.hypot(b.x-at.x,b.y-at.y,b.z-at.z)<.6))return '別の場所を選ぶ';
 if(Object.entries(def.cost).some(([id,n])=>(inventory[id]??0)<n))return '素材が不足しています';
 return '';
}
/** Face sockets share a 0.25m grid, so walls/floors can be stacked without eyeballing centers. */
export function snapBuilding(id:string,point:Vec3,normal:Vec3,rotation:number,anchor?:BuildingState):Vec3 {
 const def=importedBuildings.find(b=>b.id===id)!;if(!anchor)return {x:Math.round(point.x*4)/4,y:Math.round(point.y*8)/8,z:Math.round(point.z*4)/4};
 const old=importedBuildings.find(b=>b.id===anchor.definition)!;const c=Math.abs(Math.cos(rotation)),s=Math.abs(Math.sin(rotation)),oc=Math.abs(Math.cos(anchor.rotation)),os=Math.abs(Math.sin(anchor.rotation));
 const x=(def.size[0]*c+def.size[2]*s)/2,z=(def.size[0]*s+def.size[2]*c)/2,ax=(old.size[0]*oc+old.size[2]*os)/2,az=(old.size[0]*os+old.size[2]*oc)/2;
 if(Math.abs(normal.y)>.7)return {x:anchor.x,y:normal.y>0?anchor.y+old.size[1]:anchor.y-def.size[1],z:anchor.z};
 if(Math.abs(normal.x)>Math.abs(normal.z))return {x:anchor.x+Math.sign(normal.x)*(ax+x),y:anchor.y,z:anchor.z};
 return {x:anchor.x,y:anchor.y,z:anchor.z+Math.sign(normal.z)*(az+z)};
}
