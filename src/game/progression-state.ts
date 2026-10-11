import {REGIONAL_RECORDS} from '../content/adventure-chapters';
import {SITE_IDS} from '../content/adventure-sites';
export interface RegionalProgressionWorld {version:1;installed:number[];solved:number[];reported:number[];epilogue:number[];cycle:number}
export interface AdventureProgressionSave {version:1;tutorial:number;walked:number;records:number[];accepted:number[];heritage?:{cycles:number;records:number[];bestRace?:number;memorial?:boolean}}
export const newProgression=():AdventureProgressionSave=>({version:1,tutorial:0,walked:0,records:[],accepted:[]});
export const newRegionalProgression=():RegionalProgressionWorld=>({version:1,installed:[],solved:[],reported:[],epilogue:[],cycle:0});
function list(v:unknown,allowed:readonly number[]):v is number[]{return Array.isArray(v)&&v.length<=allowed.length&&new Set(v).size===v.length&&v.every(n=>Number.isSafeInteger(n)&&allowed.includes(n));}
const recordIds=REGIONAL_RECORDS.map(r=>r.id);
export function validateProgression(raw:unknown):AdventureProgressionSave{
 if(!raw||typeof raw!=='object')throw Error('冒険の記録が不正です');const p=raw as AdventureProgressionSave,h=p.heritage;
 if(p.version!==1||!Number.isInteger(p.tutorial)||p.tutorial<0||p.tutorial>5||!Number.isFinite(p.walked)||p.walked<0||p.walked>6||!list(p.records,recordIds)||!list(p.accepted,SITE_IDS)||h&&(!Number.isInteger(h.cycles)||h.cycles<1||h.cycles>99||!list(h.records,recordIds)||h.bestRace!==undefined&&(!Number.isFinite(h.bestRace)||h.bestRace<=0||h.bestRace>1e7)||h.memorial!==undefined&&typeof h.memorial!=='boolean'))throw Error('冒険の記録が不正です');
 return {version:1,tutorial:p.tutorial,walked:p.walked,records:[...p.records],accepted:[...p.accepted],...(h?{heritage:{cycles:h.cycles,records:[...h.records],...(h.memorial?{memorial:true}:{}),...(h.bestRace===undefined?{}:{bestRace:h.bestRace})}}:{})};
}
export function validateRegionalProgression(raw:unknown):RegionalProgressionWorld{
 if(!raw||typeof raw!=='object')throw Error('地域の記録が不正です');const r=raw as RegionalProgressionWorld;
 if(r.version!==1||!list(r.installed,SITE_IDS)||!list(r.solved,SITE_IDS)||!list(r.reported,SITE_IDS)||!list(r.epilogue,SITE_IDS)||!Number.isInteger(r.cycle)||r.cycle<0||r.cycle>99||r.solved.some(id=>!r.installed.includes(id))||r.reported.some(id=>!r.solved.includes(id))||r.epilogue.some(id=>!r.reported.includes(id)))throw Error('地域の記録が不正です');
 return {version:1,installed:[...r.installed],solved:[...r.solved],reported:[...r.reported],epilogue:[...r.epilogue],cycle:r.cycle};
}
