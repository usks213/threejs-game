import {CLASSES} from './catalog';
import type {Actor,BastionPerk,BastionSkill,BastionSkillState,BastionTraining} from './types';

export const BASTION_SKILLS:Record<BastionSkill,{name:string;description:string;duration:number;cooldown:number}>={
 rush:{name:'疾駆',description:'2.5秒間、移動速度が1.4倍。壁や身体は通り抜けられません。再使用14秒。',duration:2.5,cooldown:14},
 brace:{name:'硬守',description:'4秒間、盾で正面を防いだ被害が6%に。盾と防御操作が必要です。再使用18秒。',duration:4,cooldown:18}
};
export const BASTION_PERKS:Record<BastionPerk,{name:string;description:string;hpBonus:number;speedBonus:number}>={
 vigor:{name:'頑健',description:'最大体力が10増え、135になります。',hpBonus:10,speedBonus:0},
 stride:{name:'軽足',description:'通常の移動速度が毎秒0.15m増え、3.15mになります。',hpBonus:0,speedBonus:.15}
};
type TrainedActor=Pick<Actor,'training'|'skillState'|'classId'|'status'>;
export function getBastionTraining(actor:Pick<Actor,'training'>):BastionTraining{return actor.training?{...actor.training}:{skill:null,perk:null};}
export function activeBastionSkill(actor:TrainedActor,elapsed:number):BastionSkill|null{
 const state=actor.skillState;
 return actor.classId==='bastion'&&actor.status==='alive'&&state&&state.skill===actor.training?.skill&&Number.isFinite(elapsed)&&elapsed>=state.readyAt-BASTION_SKILLS[state.skill].cooldown&&elapsed<state.activeUntil?state.skill:null;
}
export function bastionSkillReadyIn(actor:TrainedActor,elapsed:number):number{
 return actor.classId==='bastion'&&actor.skillState&&actor.skillState.skill===actor.training?.skill&&Number.isFinite(elapsed)?Math.max(0,actor.skillState.readyAt-elapsed):0;
}
export function bastionTrainingStats(training:BastionTraining):{maxHp:number;speed:number}{
 const perk=training.perk?BASTION_PERKS[training.perk]:null;
 return {maxHp:CLASSES.bastion.hp+(perk?.hpBonus??0),speed:CLASSES.bastion.speed+(perk?.speedBonus??0)};
}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function validBastionTraining(value:unknown):value is BastionTraining{
 return record(value)&&exact(value,['skill','perk'])&&(value.skill===null||value.skill==='rush'||value.skill==='brace')&&(value.perk===null||value.perk==='vigor'||value.perk==='stride');
}
export function validBastionSkillState(value:unknown):value is BastionSkillState{
 if(!record(value)||!exact(value,['skill','activeUntil','readyAt'])||(value.skill!=='rush'&&value.skill!=='brace'))return false;
 const {duration,cooldown}=BASTION_SKILLS[value.skill];
 return typeof value.activeUntil==='number'&&Number.isFinite(value.activeUntil)&&value.activeUntil>=duration&&value.activeUntil<=1e6&&typeof value.readyAt==='number'&&Number.isFinite(value.readyAt)&&value.readyAt>=cooldown&&value.readyAt<=1e6&&Math.abs(value.readyAt-value.activeUntil-(cooldown-duration))<1e-7;
}
