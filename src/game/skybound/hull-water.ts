import type {Vec3} from '../../world/types';
import type {FluidGrid} from '../../fluid/fluid';
import type {SkyPart} from './types';
import {PART_HALF,SKY_LIMITS} from './types';
import {global} from './orientation';
export const HULL_WATER_BUDGET={references:8,raySteps:128,heightEntries:SKY_LIMITS.assembly*9,heightBands:8,solidQueries:8192}as const;
interface Footprint {x:number;z:number;minY:number;bandHeight:number;solidQueries:number;references:{x:number;z:number}[];heights:Map<string,(number|null)[]>;visibility:Map<string,boolean>}
/** Fresh per authority context: exterior columns cannot read the hull's own raised cell bottoms. */
export function createHullWaterSampler(fluid:Pick<FluidGrid,'cellSize'|'immersion'>,solid:(point:Vec3)=>boolean){
 const cached=new WeakMap<readonly SkyPart[],Footprint>();
 return(parts:readonly SkyPart[],point:Vec3,height:number):number=>{
  if(!parts.length||parts.length>SKY_LIMITS.assembly||![point.x,point.y,point.z,height].every(Number.isFinite)||height<=0||height>1)return 0;
  let hull=cached.get(parts);const size=fluid.cellSize;if(!Number.isFinite(size)||size<=0)return 0;
  if(!hull){
   let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
   for(const part of parts){const h=PART_HALF[part.kind];for(const x of[-h.x,h.x])for(const y of[-h.y,h.y])for(const z of[-h.z,h.z]){const p=global({x,y,z},part);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}}
   if(![minX,maxX,minY,maxY,minZ,maxZ].every(Number.isFinite))return 0;
   const left=(Math.floor(minX/size)-.5)*size,right=(Math.floor(maxX/size)+1.5)*size,front=(Math.floor(minZ/size)-.5)*size,back=(Math.floor(maxZ/size)+1.5)*size,x=(minX+maxX)/2,z=(minZ+maxZ)/2;
   hull={x,z,minY,bandHeight:Math.max(.25,(maxY-minY)/HULL_WATER_BUDGET.heightBands),solidQueries:0,references:[{x:left,z},{x:right,z},{x,z:front},{x,z:back},{x:left,z:front},{x:right,z:front},{x:left,z:back},{x:right,z:back}],heights:new Map(),visibility:new Map()};cached.set(parts,hull);
  }
  const key=`${point.y},${height}`;let fractions=hull.heights.get(key);
  if(!fractions){
   // Keep depth exact; a completely dry exterior never needs visibility rays.
   const depths=hull.references.map(reference=>{const value=fluid.immersion({x:reference.x,y:point.y,z:reference.z},height);return Number.isFinite(value)?Math.max(0,Math.min(1,value)):null;});
   fractions=depths.some(value=>value!==null&&value>0)?hull.references.map((reference,index)=>{
    const fraction=depths[index];if(fraction===null)return null;
    const band=Math.floor((point.y+height/2-hull!.minY)/hull!.bandHeight),visibilityKey=`${index},${band}`;
    let visible=hull!.visibility.get(visibilityKey);
    if(visible===undefined){
     visible=true;const low=hull!.minY+band*hull!.bandHeight,distance=Math.hypot(reference.x-hull!.x,reference.z-hull!.z),steps=Math.min(HULL_WATER_BUDGET.raySteps,Math.max(1,Math.ceil(distance/Math.min(.25,size/2))));
     // A tilted hull has a distinct height at almost every probe. Reuse a whole
     // vertical band's rays only when its lower, middle and upper planes are clear.
     // Keep vertical probes at most .125m apart, including unusually tall hulls.
     const levels=Math.max(2,Math.ceil(hull!.bandHeight/.125));
     outer:for(let level=0;level<=levels;level++)for(let i=0;i<=steps;i++){
      if(hull!.solidQueries>=HULL_WATER_BUDGET.solidQueries){visible=false;break outer;}
      hull!.solidQueries++;const t=i/steps;if(solid({x:hull!.x+(reference.x-hull!.x)*t,y:low+hull!.bandHeight*level/levels,z:hull!.z+(reference.z-hull!.z)*t})){visible=false;break outer;}
     }
     // Exhausted or blocked bands contribute no lift; never infer unobstructed water.
     hull!.visibility.set(visibilityKey,visible);
    }
    return visible?fraction:null;
   }):depths;
   if(hull.heights.size<HULL_WATER_BUDGET.heightEntries)hull.heights.set(key,fractions);
  }
  let total=0,weight=0;
  for(let i=0;i<hull.references.length;i++){if(fractions[i]===null)continue;const p=hull.references[i],w=1/Math.max(size*size,(p.x-point.x)**2+(p.z-point.z)**2);total+=fractions[i]!*w;weight+=w;}
  return weight?Math.max(0,Math.min(1,total/weight)):0;
 };
}
