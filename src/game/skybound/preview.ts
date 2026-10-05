import type {Vec3} from '../../world/types';
import type {SkyPart,SkyPartKind,SkyMaterial,SkyBlueprint} from './types';
import {MATERIAL_MASS,PART_COST,MATERIAL_ITEM,PART_HALF} from './types';
import {yawQuaternion,multiply,orientation,rotate,heading,local,global} from './orientation';
export interface ConstructionPreview {parts:SkyPart[];attachment?:[Vec3,Vec3]}
export function constructionGroup(parts:readonly SkyPart[],root:number):SkyPart[]{const ids=new Set<number>(),pending=[root];while(pending.length&&ids.size<16){const id=pending.pop()!;if(ids.has(id))continue;ids.add(id);pending.push(...(parts.find(p=>p.id===id)?.links??[]));}return parts.filter(p=>ids.has(p.id));}
export const snapConstruction=(p:Vec3):Vec3=>({x:Math.round(p.x*8)/8,y:Math.round(p.y*8)/8,z:Math.round(p.z*8)/8});
export function movedPreview(parts:readonly SkyPart[],id:number,target:Vec3,rotation:number):ConstructionPreview{
 const root=parts.find(p=>p.id===id);if(!root)return{parts:[]};const position=snapConstruction(target),dq=yawQuaternion(rotation-root.rotation);
 return{parts:constructionGroup(parts,id).map(p=>{const offset=rotate({x:p.position.x-root.position.x,y:p.position.y-root.position.y,z:p.position.z-root.position.z},dq),q=multiply(dq,orientation(p));return{...p,position:{x:position.x+offset.x,y:position.y+offset.y,z:position.z+offset.z},q,rotation:heading(q)};})};
}
export function createdPreview(kind:SkyPartKind,material:SkyMaterial,target:Vec3):ConstructionPreview{return{parts:[{id:-1,kind,material,position:snapConstruction(target),q:yawQuaternion(0),rotation:0,mass:MATERIAL_MASS[material]*PART_COST[kind],velocity:{x:0,y:0,z:0},links:[],epoch:0}]};}
export function rebuiltPreview(plan:SkyBlueprint,target:Vec3):ConstructionPreview{const at=snapConstruction(target);return{parts:plan.parts.map((part,i)=>({...createdPreview(part.kind,part.material,{x:at.x+part.offset.x,y:at.y+part.offset.y,z:at.z+part.offset.z}).parts[0],id:-1-i,position:{x:at.x+part.offset.x,y:at.y+part.offset.y,z:at.z+part.offset.z},q:part.q??yawQuaternion(part.rotation),rotation:part.rotation}))};}
export function constructionCost(parts:readonly Pick<SkyPart,'material'|'kind'>[]):Record<string,number>{const cost:Record<string,number>={};for(const part of parts){const item=MATERIAL_ITEM[part.material];cost[item]=(cost[item]??0)+PART_COST[part.kind];}return cost;}

export function attachmentPoints(a:SkyPart,b:SkyPart):[Vec3,Vec3]{const near=(point:Vec3,part:SkyPart)=>{const p=local(point,part),h=PART_HALF[part.kind];return global({x:Math.max(-h.x,Math.min(h.x,p.x)),y:Math.max(-h.y,Math.min(h.y,p.y)),z:Math.max(-h.z,Math.min(h.z,p.z))},part);};const first=near(b.position,a),second=near(first,b);return [near(second,a),second];}

export function filterBlueprints(plans:readonly SkyBlueprint[],query:string,order:'original'|'name'|'parts'):SkyBlueprint[]{const text=query.trim().toLocaleLowerCase('ja'),filtered=plans.filter(p=>!text||p.name.toLocaleLowerCase('ja').includes(text)||String(p.id).includes(text));return order==='original'?filtered:filtered.sort((a,b)=>(order==='name'?a.name.localeCompare(b.name,'ja'):a.parts.length-b.parts.length)||a.id-b.id);}
