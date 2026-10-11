import type {MeadowState} from './meadows/state';
import type {Vec3} from '../world/types';
import {skyboundLayer} from '../world/skybound-terrain';
export const CHART_LIMIT=6000;
/** Private layer-aware exploration; preserve old records rather than truncate a legacy save. */
export function chartNearby(m:MeadowState,p:Vec3):void{
 const known=new Set((m.mapCells??[]).map(cell=>cell.includes(':')?cell:'surface:'+cell)),layer=skyboundLayer(p.y);
 for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)if(x*x+z*z<=9&&known.size<CHART_LIMIT)known.add(layer+':'+(Math.floor(p.x/8)+x)+','+(Math.floor(p.z/8)+z));
 m.mapCells=[...known];
}
export function chartCell(text:string):{layer:'surface'|'sky'|'depths';x:number;z:number}|null{const match=/^(?:(surface|sky|depths):)?(-?\d+),(-?\d+)$/.exec(text);if(!match)return null;const x=Number(match[2]),z=Number(match[3]);return Number.isSafeInteger(x)&&Number.isSafeInteger(z)?{layer:(match[1]??'surface') as 'surface'|'sky'|'depths',x:x*8,z:z*8}:null;}
