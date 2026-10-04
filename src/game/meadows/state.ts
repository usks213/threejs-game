import { ARMOR, FOODS, ITEM_WEIGHT, TOOL_DURABILITY } from '../../content/meadows/data';
import type { AdventureSave, BuildingState } from '../types';
import type { Vec3 } from '../../world/types';
export interface MeadowState {
 version:1; worldTiles?:string[]; slots?:(import('./inventory-layout').ItemSlot|null)[]; pins?:{id:number;x:number;z:number;label:string}[]; exerting?:boolean; mapCells?:string[]; kills?:number; noSkillDrain?:number; riding?:number; graves?:{x:number;y:number;z:number;items:Record<string,number>}[]; sprinting?:boolean; sneaking?:boolean; foods:{id:string;remaining:number}[]; gear:Record<string,string>; durability:Record<string,number>; quality:Record<string,number>; skills:Record<string,number>; discovered:string[]; power:number; powerCooldown:number; offered:boolean; wet:number; shelter:boolean; warmth:boolean; cold:boolean; comfort:number; weight:number; raid:number; raidAt:number; tutorial:number;
}
export function newMeadows():MeadowState{return {version:1,foods:[],gear:{chest:'ragTunic'},durability:{ragTunic:100},quality:{},skills:{},discovered:['ragTunic'],power:0,powerCooldown:0,offered:false,wet:0,shelter:false,warmth:false,cold:false,comfort:0,weight:0,raid:0,raidAt:600,tutorial:0};}
export function foodStats(s:AdventureSave){
 if(!s.meadows)return {health:100,stamina:100,healing:s.food>0?.8:0};
 let health=25,stamina=50,healing=0;
 for(const food of s.meadows.foods){const def=FOODS[food.id];if(!def)continue;const scale=.5+.5*Math.min(1,food.remaining/def.seconds);health+=def.health*scale;stamina+=def.stamina*scale;healing+=def.healing/10;}
 return {health:Math.round(health),stamina:Math.round(stamina),healing};
}
export function weight(inventory:Record<string,number>):number{return Object.entries(inventory).reduce((n,[id,count])=>n+count*(ITEM_WEIGHT[id]??1),0);}
export function maxDurability(id:string,quality=1):number{return (TOOL_DURABILITY[id]??ARMOR[id]?.durability??100)+(quality-1)*50;}
export function armorValue(s:AdventureSave):number{return Object.values(s.meadows?.gear??{}).reduce((n,id)=>n+((s.inventory[id]??0)>0&&(s.meadows?.durability[id]??1)>0?(ARMOR[id]?.armor??0)+Math.max(0,(s.meadows?.quality[id]??1)-1)*2:0),0);}
export function roofed(p:Vec3,buildings:BuildingState[]):boolean{return buildings.some(b=>/roof|ridge/i.test(b.definition)&&Math.abs(b.x-p.x)<1.3&&Math.abs(b.z-p.z)<1.3&&b.y>p.y+.5&&b.y-p.y<8);}
export function benchLevel(p:Vec3,buildings:BuildingState[]):number{
 const bench=buildings.find(b=>b.definition==='bench'&&Math.hypot(p.x-b.x,p.z-b.z)<5);if(!bench)return 0;
 return 1+['choppingBlock','tanningRack'].filter(id=>buildings.some(b=>b.definition===id&&Math.hypot(b.x-bench.x,b.z-bench.z)<3)).length;
}
export function learn(s:AdventureSave,id:string,amount:number):void{if(s.meadows)s.meadows.skills[id]=Math.min(100,(s.meadows.skills[id]??0)+amount);}
