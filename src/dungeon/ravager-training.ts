import type {Actor,RavagerPerk,RavagerSkill,RavagerSkillState,RavagerTraining} from './types';

export const RAVAGER_SKILLS:Record<RavagerSkill,{name:string;description:string;duration:number;cooldown:number}>={
 frenzy:{name:'狂奔',description:'5秒間、大剣の近接ダメージが1.25倍、すべての被ダメージが1.2倍。装備・携行中の大剣が必要です。再使用18秒。',duration:5,cooldown:18}
};
export const RAVAGER_PERKS:Record<RavagerPerk,{name:string;description:string}>={
 laststand:{name:'背水',description:'体力が最大値の35%以下の間、剣・大剣・短剣の近接ダメージが1.15倍。'},
 followthrough:{name:'追撃',description:'大剣の強撃後の立て直し時間を20%短縮。振りかぶりと刃の軌道・接触時間は変わりません。'}
};
type TrainedActor=Pick<Actor,'ravagerTraining'|'ravagerSkillState'|'classId'|'status'>;
// Fixed 50ms additions can land a few ulps below an exact duration boundary.
const CLOCK_EPSILON=1e-7;
export function getRavagerTraining(actor:Pick<Actor,'ravagerTraining'>):RavagerTraining{return actor.ravagerTraining?{...actor.ravagerTraining}:{skill:null,perk:null};}
export function activeRavagerSkill(actor:TrainedActor,elapsed:number):RavagerSkill|null{
 const state=actor.ravagerSkillState;
 // A snapshot may redact the bag. The active clock also keeps the incoming risk
 // after a weapon change; equipment is checked when activating and dealing damage.
 return actor.classId==='ravager'&&actor.status==='alive'&&actor.ravagerTraining?.skill==='frenzy'&&validRavagerSkillState(state)&&Number.isFinite(elapsed)&&elapsed>=0&&elapsed+CLOCK_EPSILON>=state.readyAt-RAVAGER_SKILLS.frenzy.cooldown&&elapsed+CLOCK_EPSILON<state.activeUntil?'frenzy':null;
}
export function ravagerSkillReadyIn(actor:TrainedActor,elapsed:number):number{
 if(actor.classId!=='ravager'||actor.ravagerTraining?.skill!=='frenzy'||!validRavagerSkillState(actor.ravagerSkillState)||!Number.isFinite(elapsed)||elapsed<0)return 0;
 const remaining=actor.ravagerSkillState.readyAt-elapsed;
 return remaining>CLOCK_EPSILON?remaining:0;
}
export function ravagerMeleeMultiplier(actor:TrainedActor&Pick<Actor,'weapon'|'hp'|'maxHp'>,elapsed:number):number{
 if(actor.classId!=='ravager'||actor.status!=='alive'||!['sword','greatsword','dagger'].includes(actor.weapon))return 1;
 const frenzy=actor.weapon==='greatsword'&&activeRavagerSkill(actor,elapsed)==='frenzy'?1.25:1;
 const laststand=actor.ravagerTraining?.perk==='laststand'&&Number.isFinite(actor.hp)&&Number.isFinite(actor.maxHp)&&actor.hp>0&&actor.maxHp>0&&actor.hp<=actor.maxHp*.35?1.15:1;
 return frenzy*laststand;
}
export function ravagerIncomingMultiplier(actor:TrainedActor,elapsed:number):number{return activeRavagerSkill(actor,elapsed)==='frenzy'?1.2:1;}
/** Advance only recovery's authored clock, shared by snapshot poses and contacts. */
export function ravagerRecoveryRate(actor:Pick<Actor,'classId'|'status'|'weapon'|'kind'|'phase'|'ravagerTraining'>):number{
 return actor.classId==='ravager'&&actor.status==='alive'&&actor.weapon==='greatsword'&&actor.kind==='overhead'&&actor.phase==='recover'&&actor.ravagerTraining?.perk==='followthrough'?1/.8:1;
}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function validRavagerTraining(value:unknown):value is RavagerTraining{
 return record(value)&&exact(value,['skill','perk'])&&(value.skill===null||value.skill==='frenzy')&&(value.perk===null||value.perk==='laststand'||value.perk==='followthrough');
}
export function validRavagerSkillState(value:unknown):value is RavagerSkillState{
 if(!record(value)||!exact(value,['skill','activeUntil','readyAt'])||value.skill!=='frenzy')return false;
 const {duration,cooldown}=RAVAGER_SKILLS.frenzy;
 return typeof value.activeUntil==='number'&&Number.isFinite(value.activeUntil)&&value.activeUntil>=duration&&value.activeUntil<=1e6&&typeof value.readyAt==='number'&&Number.isFinite(value.readyAt)&&value.readyAt>=cooldown&&value.readyAt<=1e6&&Math.abs(value.readyAt-value.activeUntil-(cooldown-duration))<1e-7;
}
