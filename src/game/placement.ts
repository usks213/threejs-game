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
