import {validPlayerEnvironmentState,type PlayerEnvironmentState} from './player-environment';
import type {Vec3} from './voxel';
import type {AttackKind} from './motion';
import type {Element} from './elements';
import {SURVIVAL_RECIPES,type RecipeId} from './survival';
export function createPlayerState(){return {position:{x:0,y:.25,z:6},yaw:0,pitch:0,hp:100,stamina:100,vy:0,grounded:true,flasks:1,tool:false,phase:'idle' as 'idle'|'windup'|'strike'|'recover'|'dodge'|'heal'|'cast',time:0,heavy:false,hit:false,blockTime:0,dodgeX:0,dodgeZ:0,attack:'slash' as AttackKind,combo:0,queued:'' as ''|'attack'|'heavy',hitstop:0,vx:0,vz:0,stride:0,guard:0,impact:0};}
export type PlayerState=ReturnType<typeof createPlayerState>;
export interface ActorAux {soilFill?:boolean;environment?:PlayerEnvironmentState;selectedElement:Element;castCooldown:number;footTime:number;regenDelay:number;cold:number;gliding:boolean;grapple:Vec3|null;grappleTime:number;oxygen:number;swimming:boolean;deathCause:string;buildMode:boolean;recipe:RecipeId;rotation:number;shroudSeconds:number}
export interface CompanionSnapshot {version:1;player:PlayerState;aux:ActorAux}
export const cloneCompanion=(value:CompanionSnapshot):CompanionSnapshot=>JSON.parse(JSON.stringify(value));
export function validCompanionSnapshot(value:unknown,western=false):value is CompanionSnapshot {const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,position=(v:unknown)=>object(v)&&Object.keys(v).length===3&&finite(v.x,western?-128:-80,western?128:80)&&finite(v.y,-30,100)&&finite(v.z,western?-160:-100,100);if(!object(value)||Object.keys(value).length!==3||value.version!==1||!object(value.player)||!object(value.aux))return false;const p=value.player,a=value.aux;if(Object.keys(p).some(k=>!Object.hasOwn(createPlayerState(),k))||Object.keys(p).length!==Object.keys(createPlayerState()).length||!position(p.position))return false;
 for(const key of ['grounded','tool','heavy','hit'])if(typeof p[key]!=='boolean')return false;
 for(const key of ['hp','stamina','flasks','time','blockTime','combo','hitstop','stride','guard','impact'])if(!finite(p[key],0,key==='guard'||key==='impact'?1:1000000))return false;
 for(const key of ['yaw','vy','vx','vz','dodgeX','dodgeZ'])if(!finite(p[key],-10000,10000))return false;
 if(!finite(p.hp,0,1000)||!finite(p.stamina,0,1000)||!Number.isSafeInteger(p.flasks)||!Number.isSafeInteger(p.combo))return false;
 if(!finite(p.pitch,-Math.PI/2,Math.PI/2)||!['idle','windup','strike','recover','dodge','heal','cast'].includes(String(p.phase))||!['slash','return','overhead'].includes(String(p.attack))||!['','attack','heavy'].includes(String(p.queued)))return false;
 for(const key of ['gliding','swimming','buildMode'])if(typeof a[key]!=='boolean')return false;
 for(const key of ['castCooldown','footTime','regenDelay','grappleTime'])if(!finite(a[key],0,100))return false;
 return (a.soilFill===undefined||typeof a.soilFill==='boolean')&&(Object.keys(a).filter(k=>k!=='soilFill').length===15||Object.keys(a).filter(k=>k!=='soilFill').length===16&&Object.hasOwn(a,'environment'))&&(a.environment===undefined||validPlayerEnvironmentState(a.environment))&&['fire','water','earth','wind','lightning'].includes(String(a.selectedElement))&&finite(a.cold,0,100)&&finite(a.oxygen,0,20)&&finite(a.shroudSeconds,0,210)&&typeof a.deathCause==='string'&&a.deathCause.length<=200&&(a.grapple===null||position(a.grapple))&&typeof a.recipe==='string'&&Object.hasOwn(SURVIVAL_RECIPES,a.recipe)&&finite(a.rotation,0,3)&&Number.isInteger(a.rotation);
}
