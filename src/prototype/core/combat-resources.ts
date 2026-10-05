import type {Element} from './elements';
import {createCombatFocus,type CombatFocusState} from './enemy-tactics';
export const MAX_MANA=100, SPELL_MANA=20, SPELL_CAST_SECONDS=.45, HEAVY_READY_SECONDS=.45, HEAVY_MAX_SECONDS=1.5;
export const heavyReady=(charge:number)=>charge+1e-9>=HEAVY_READY_SECONDS;
export const heavyChargePoseTime=(charge:number,windup:number)=>windup*.45*Math.min(1,charge/HEAVY_READY_SECONDS);
export interface CombatResources {mana:number;charging:boolean;charge:number;pending:Element|null;castRemaining:number;focus:CombatFocusState}
export const createCombatResources=():CombatResources=>({mana:MAX_MANA,charging:false,charge:0,pending:null,castRemaining:0,focus:createCombatFocus()});
export const cloneCombatResources=(v:CombatResources):CombatResources=>({...v,focus:{value:v.focus.value,confirmedHitIds:[...v.focus.confirmedHitIds],spentActionIds:[...v.focus.spentActionIds]}});
/** Save reloads never replay an input that is no longer held. Mana already spent stays spent. */
export function settledCombatResources(v:CombatResources){const copy=cloneCombatResources(v);copy.charging=false;copy.charge=0;copy.pending=null;copy.castRemaining=0;copy.focus.confirmedHitIds=[];copy.focus.spentActionIds=[];return copy;}
export function validCombatResources(v:unknown):v is CombatResources {
 const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x),n=(x:unknown,max:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=max;
 if(!record(v)||Object.keys(v).length!==6||!['mana','charging','charge','pending','castRemaining','focus'].every(k=>Object.hasOwn(v,k))||!n(v.mana,MAX_MANA)||typeof v.charging!=='boolean'||!n(v.charge,HEAVY_MAX_SECONDS)||!n(v.castRemaining,SPELL_CAST_SECONDS)||!record(v.focus))return false;
 if(v.pending!==null&&!['fire','water','earth','wind','lightning'].includes(String(v.pending))||!v.charging&&v.charge!==0||v.charging&&v.pending!==null||v.pending===null&&(v.castRemaining!==0)||v.pending!==null&&v.castRemaining===0)return false;
 const f=v.focus,ids=(x:unknown,max:number)=>Array.isArray(x)&&x.length<=max&&Object.keys(x).length===x.length&&new Set(x).size===x.length&&x.every(id=>typeof id==='string'&&id.length>0&&id.length<=80);
 return Object.keys(f).length===3&&Object.keys(f).every(k=>['value','confirmedHitIds','spentActionIds'].includes(k))&&n(f.value,100)&&ids(f.confirmedHitIds,256)&&ids(f.spentActionIds,64);
}
export function combatReadout(v:CombatResources,focusAllowed:boolean){
 return `マナ ${Math.floor(v.mana)}/${MAX_MANA} · ${v.pending?`詠唱 ${v.castRemaining.toFixed(1)}秒`:v.charging?(heavyReady(v.charge)?'強撃準備完了 · 離して攻撃':`強撃溜め ${Math.round(v.charge/HEAVY_READY_SECONDS*100)}%`):`集中 ${Math.floor(v.focus.value)}/100${focusAllowed?'':'（丈夫な身体I＋近接武器）'}`}`;
}

export function combatFitsPhase(v:CombatResources,phase:unknown){return (!v.charging||phase==='idle')&&(v.pending===null||phase==='cast');}
