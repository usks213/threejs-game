import {validCompanionSnapshot,type CompanionSnapshot} from '../core/companion';
import type {CoreSimulation} from '../core/simulation';
import {record,number,integer,vector} from '../../save/validation';
import type {Vec3} from '../core/voxel';
import type {AttackKind} from '../core/motion';
const phases=['idle','windup','strike','recover','dodge','heal','cast'] as const;
const enemyPhases=['idle','windup','strike','recover','stagger','dead'] as const;
const attacks=['slash','return','overhead'];
export interface ActorFrame {position:Vec3;yaw:number;pitch:number;hp:number;stamina:number;phase:typeof phases[number];time:number;attack:AttackKind;stride:number;guard:number;tool:boolean;grounded:boolean;vx:number;vy:number;vz:number}
export interface EnemyFrame {id:number;position:Vec3;yaw:number;hp:number;phase:typeof enemyPhases[number];time:number;attack:AttackKind;stride:number}
export interface GameFrame {version:1;seconds:number;worldHour:number;worldDay:number;host:ActorFrame;guest:CompanionSnapshot|null;focus:number;enemies:EnemyFrame[];arrows:CoreSimulation['arrows'];shots:CoreSimulation['enemyShots'];tells:CoreSimulation['tells']}
const dense=(v:unknown,max:number):v is unknown[]=>Array.isArray(v)&&v.length<=max&&Object.keys(v).length===v.length;
const actorKeys=['position','yaw','pitch','hp','stamina','phase','time','attack','stride','guard','tool','grounded','vx','vy','vz'];
const position=(v:unknown):v is Vec3=>vector(v)&&number(v.x,-80,80)&&number(v.y,-30,100)&&number(v.z,-100,30);
export function captureActor(p:CoreSimulation['player']):ActorFrame{return {position:{...p.position},yaw:p.yaw,pitch:p.pitch,hp:p.hp,stamina:p.stamina,phase:p.phase,time:p.time,attack:p.attack,stride:p.stride,guard:p.guard,tool:p.tool,grounded:p.grounded,vx:p.vx,vy:p.vy,vz:p.vz};}
export function validActor(v:unknown):v is ActorFrame{return record(v)&&Object.keys(v).length===actorKeys.length&&Object.keys(v).every(k=>actorKeys.includes(k))&&position(v.position)&&number(v.yaw)&&number(v.pitch,-Math.PI/2,Math.PI/2)&&number(v.hp,0,500)&&number(v.stamina,0,500)&&phases.includes(v.phase as ActorFrame['phase'])&&number(v.time,0,1e9)&&attacks.includes(String(v.attack))&&number(v.stride,0,1e9)&&number(v.guard,0,1)&&typeof v.tool==='boolean'&&typeof v.grounded==='boolean'&&number(v.vx,-100,100)&&number(v.vy,-100,100)&&number(v.vz,-100,100);}
export function captureGameFrame(sim:CoreSimulation):GameFrame{return {version:1,seconds:sim.seconds,worldHour:sim.worldHour,worldDay:sim.worldDay,host:captureActor(sim.player),guest:sim.companionSnapshot(),focus:sim.focus.value,enemies:sim.enemies.map(e=>({id:e.id,position:{...e.position},yaw:e.yaw,hp:e.hp,phase:e.phase,time:e.time,attack:e.attack,stride:e.stride})),arrows:sim.arrows.map(a=>({...a,position:{...a.position},velocity:{...a.velocity}})),shots:sim.enemyShots.map(a=>({...a,position:{...a.position},velocity:{...a.velocity}})),tells:sim.tells.map(t=>({...t,position:{...t.position}}))};}
export function validGameFrame(value:unknown,roster:number):value is GameFrame{
 if(!record(value)||value.version!==1||!number(value.seconds,0,1e9)||!number(value.worldHour,0,24)||!integer(value.worldDay,0,1e9)||!validActor(value.host)||value.guest!==null&&(!validCompanionSnapshot(value.guest)||!validActor(captureActor(value.guest.player)))||!number(value.focus,0,100)||!dense(value.enemies,roster)||value.enemies.length!==roster)return false;
 if(value.enemies.some((e,i)=>!record(e)||e.id!==i||!position(e.position)||!number(e.yaw)||!number(e.hp,0,1000)||!enemyPhases.includes(e.phase as EnemyFrame['phase'])||!number(e.time,0,1e9)||!attacks.includes(String(e.attack))||!number(e.stride,0,1e9)))return false;
 for(const key of ['arrows','shots']){const list=value[key];if(!dense(list,32)||list.some(a=>!record(a)||!position(a.position)||!vector(a.velocity)||Math.hypot(a.velocity.x,a.velocity.y,a.velocity.z)>100||!number(a.life,-1,20)||key==='shots'&&(!number(a.damage,0,1000)||!number(a.radius,0,5))))return false;}
 return dense(value.tells,24)&&value.tells.every(t=>record(t)&&position(t.position)&&number(t.radius,0,20)&&number(t.remaining,-1,20)&&typeof t.kind==='string'&&t.kind.length<=40);
}
/** Guest-only presentation update. Never ticks physics, harvests, grants rewards or writes a save. */
export function applyGameFrame(sim:CoreSimulation,value:unknown,preserveLocalLook=true):ActorFrame|null{
 if(!validGameFrame(value,sim.enemies.length)||!value.guest)return null;
 const yaw=sim.player.yaw,pitch=sim.player.pitch;Object.assign(sim.player,value.guest.player,{position:{...value.guest.player.position}});const aux=value.guest.aux;sim.selectedElement=aux.selectedElement;sim.buildMode=aux.buildMode;sim.survival.selected=aux.recipe;sim.survival.rotation=aux.rotation;sim.cold=aux.cold;sim.gliding=aux.gliding;sim.grapple=aux.grapple?{...aux.grapple}:null;sim.oxygen=aux.oxygen;sim.swimming=aux.swimming;sim.deathCause=aux.deathCause;sim.campaign.state.shroudSeconds=aux.shroudSeconds;sim.focus.value=value.focus;if(preserveLocalLook){sim.player.yaw=yaw;sim.player.pitch=pitch;}
 sim.seconds=value.seconds;sim.worldHour=value.worldHour;sim.worldDay=value.worldDay;
 for(let i=0;i<sim.enemies.length;i++){const e=value.enemies[i];Object.assign(sim.enemies[i],{id:e.id,position:{...e.position},yaw:e.yaw,hp:e.hp,phase:e.phase,time:e.time,attack:e.attack,stride:e.stride});}
 sim.arrows.splice(0,sim.arrows.length,...value.arrows.map(a=>({...a,position:{...a.position},velocity:{...a.velocity}})));sim.enemyShots.splice(0,sim.enemyShots.length,...value.shots.map(a=>({...a,position:{...a.position},velocity:{...a.velocity}})));sim.tells.splice(0,sim.tells.length,...value.tells.map(t=>({...t,position:{...t.position}})));
 return {...value.host,position:{...value.host.position}};
}
