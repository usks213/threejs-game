import type {GameSimulation} from '../simulation/game-simulation';
import {insideBounds,WORLD,type Vec3} from '../world/types';
export interface SharedPin{id:number;owner:string;label:string;position:Vec3}
export function validateSharedPins(raw:unknown):SharedPin[]{if(!Array.isArray(raw)||raw.length>32)throw Error('共有地図の印が不正です');const ids=new Set<number>();return raw.map(p=>{if(!p||!Number.isSafeInteger(p.id)||p.id<1||ids.has(p.id)||typeof p.owner!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(p.owner)||typeof p.label!=='string'||!p.label.trim()||p.label.length>32||/[\u0000-\u001f]/.test(p.label)||!p.position||!insideBounds(p.position,WORLD,1))throw Error('共有地図の印が不正です');ids.add(p.id);return{id:p.id,owner:p.owner,label:p.label,position:{x:p.position.x,y:p.position.y,z:p.position.z}};});}
export function sharedPinAction(sim:GameSimulation,owner:string,action:'map-pin-share'|'map-pin-remove',id:string):{dirty:string[];message:string}{
 if(sim.world.generator!==4)throw Error('共有の印はこの冒険で使用します');
 if(action==='map-pin-remove'){const pin=sim.sharedPins.find(p=>p.id===Number(id));if(!pin||pin.owner!==owner)throw Error('自分が共有した印だけ消せます');sim.sharedPins.splice(sim.sharedPins.indexOf(pin),1);return{dirty:[],message:'共有の印を消しました'};}
 const label=id.trim();if(!label||label.length>32||/[\u0000-\u001f]/.test(label))throw Error('印の名前は1〜32文字で入力してください');if(sim.sharedPins.length>=32)throw Error('共有の印は部屋に32個までです');sim.sharedPins.push({id:sim.allocateEntityId(),owner,label,position:{x:sim.player.x,y:sim.player.y,z:sim.player.z}});return{dirty:[],message:'現在地の印を、この部屋の仲間へ共有しました'};
}
