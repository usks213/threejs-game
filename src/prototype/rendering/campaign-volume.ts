import type {FogBox} from '../../rendering/volumetrics/medium';
import {SHROUD_ZONES} from '../core/shroud-zones';
import {REGIONS} from '../core/regions';
/** Presentation uses the same hazard bounds; it never changes hazard/save data. */
export function campaignFogBoxes(western:boolean):FogBox[]{const width=western?128:80;return [
 ...SHROUD_ZONES.map(z=>({min:[z.minX??-width,z.floor,z.minZ] as const,max:[z.maxX??width,z.floor+z.height,z.maxZ] as const,density:z.deep?.3:.19})),
 ...REGIONS.filter(r=>r.climate==='ash').map(r=>({min:[r.bounds.minX,r.groundY-.1,r.bounds.minZ] as const,max:[r.bounds.maxX,r.groundY+5,r.bounds.maxZ] as const,density:.23})),
 ];}
