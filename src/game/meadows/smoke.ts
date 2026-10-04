import { BUILDINGS } from '../../content/catalog';
import type { BuildingState } from '../types';
import { roofHeight } from './building-shapes';
import { localPoint } from './obstacles';
export interface SmokeColumn { ceiling:number|null; ventilated:boolean }
/** A bounded ventilation approximation: the actual roof/floor above the fire and eight escape rays. */
const cache=new WeakMap<BuildingState,{tick:number;count:number;value:SmokeColumn}>();
export function smokeColumn(fire:BuildingState,buildings:BuildingState[],seconds?:number):SmokeColumn {
 if(seconds!==undefined){const tick=Math.floor(seconds*2),saved=cache.get(fire);if(saved?.tick===tick&&saved.count===buildings.length)return saved.value;const value=smokeColumn(fire,buildings);cache.set(fire,{tick,count:buildings.length,value});return value;}
 const nearby=buildings.filter(b=>Math.hypot(b.x-fire.x,b.z-fire.z)<6&&b.y<fire.y+8);
 let ceiling=Infinity;
 for(const b of nearby){const p=localPoint(b,fire.x,fire.z),def=BUILDINGS.find(d=>d.id===b.definition);if(!def)continue;
  const roof=roofHeight(b.definition,p.x,p.z),floor=['floor','smallFloor'].includes(b.definition);
  if((roof!==null||floor)&&Math.abs(p.x)<=def.size[0]/2&&Math.abs(p.z)<=def.size[2]/2){const h=b.y+(roof??0);if(h>fire.y+.2)ceiling=Math.min(ceiling,h);}
 }
 if(!Number.isFinite(ceiling))return {ceiling:null,ventilated:true};
 const height=ceiling-.35;
 for(let ray=0;ray<8;ray++){
  const a=ray*Math.PI/4;let blocked=false;
  for(let d=.25;d<=3.5&&!blocked;d+=.25){const x=fire.x+Math.sin(a)*d,z=fire.z+Math.cos(a)*d;
   blocked=nearby.some(b=>{if(b.open||!['wall','halfWall','slantWall','door','gate','stakeWall'].includes(b.definition))return false;
    const def=BUILDINGS.find(v=>v.id===b.definition)!,p=localPoint(b,x,z);return height>b.y&&height<b.y+def.size[1]&&Math.abs(p.x)<def.size[0]/2+.08&&Math.abs(p.z)<def.size[2]/2+.08;
   });
  }
  if(!blocked)return {ceiling,ventilated:true};
 }
 return {ceiling,ventilated:false};
}
