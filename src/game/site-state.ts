import {SITES,SITE_IDS} from '../content/adventure-sites';
import {insideBounds,finiteVec,WORLD,type Vec3} from '../world/types';
export interface SiteWorld {version:1;layout:1;storyMode:'full'|'side';installed:number[];bases:Record<string,number>;skipped:Record<string,number>;completed:number[];evidence:Record<string,number>;epochs:Record<string,number>;rescue?:{position:Vec3;following?:string;arrived:boolean}}
export const siteId=(v:unknown):v is number=>typeof v==='number'&&SITE_IDS.includes(v as typeof SITE_IDS[number]);
export function validateSiteWorld(raw:unknown):SiteWorld{
 if(!raw||typeof raw!=='object')throw Error('探索拠点の保存が不正です');const s=raw as SiteWorld;
 const ids=(v:unknown):v is number[]=>Array.isArray(v)&&v.length<=3&&new Set(v).size===v.length&&v.every(siteId);
 const record=(v:unknown,integer:boolean,max:number)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=3&&Object.entries(v).every(([id,n])=>siteId(Number(id))&&typeof n==='number'&&Number.isFinite(n)&&(!integer||Number.isSafeInteger(n))&&n>=(integer?0:-16)&&n<=max);
 if(s.version!==1||s.layout!==1||!['full','side'].includes(s.storyMode)||!ids(s.installed)||!ids(s.completed)||!record(s.bases,false,46)||!record(s.skipped,true,200)||!record(s.evidence,true,31)||!record(s.epochs,true,1000000)||s.rescue&&(!s.rescue.position||!finiteVec(s.rescue.position)||!insideBounds(s.rescue.position,WORLD,1)||typeof s.rescue.arrived!=='boolean'))throw Error('探索拠点の状態が不正です');if(s.installed.some(id=>!Object.hasOwn(s.bases,id))||s.completed.some(id=>!s.installed.includes(id)))throw Error('拠点配置の記録がありません');
 return {version:1,layout:1,storyMode:s.storyMode,installed:[...s.installed],bases:{...s.bases},skipped:{...s.skipped},completed:[...s.completed],evidence:{...s.evidence},epochs:{...s.epochs},...(s.rescue?{rescue:{position:{x:s.rescue.position.x,y:s.rescue.position.y,z:s.rescue.position.z},arrived:s.rescue.arrived}}:{})};
}
export function validSiteJournal(raw:unknown):raw is number[]{return Array.isArray(raw)&&raw.length<=12&&new Set(raw).size===raw.length&&raw.every(id=>siteId(id)||SITES.some(s=>Number.isInteger(id)&&id>=s.id*10&&id<=s.id*10+2));}
