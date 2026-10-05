import {validWesternNpcLifeState,type WesternNpcLifeState} from '../core/western-npc-life';
import {validNpcLifeState,type NpcLifeState} from '../core/npc-life';
import {validHomesteadAnimalState,type HomesteadAnimalState} from '../core/homestead-animal';
import {createPlayerEnvironmentState,clonePlayerEnvironmentState,validPlayerEnvironmentState,type PlayerEnvironmentState} from '../core/player-environment';
import {validCompanionSnapshot,type CompanionSnapshot} from '../core/companion';
import type {CoreSimulation} from '../core/simulation';
import {record,number,integer,vector} from '../../save/validation';
import type {Vec3} from '../core/voxel';
import type {AttackKind} from '../core/motion';
const phases=['idle','windup','strike','recover','dodge','heal','cast'] as const;
const enemyPhases=['idle','windup','strike','recover','stagger','dead'] as const;
const attacks=['slash','return','overhead'];
export interface ActorFrame {environment?:PlayerEnvironmentState;position:Vec3;yaw:number;pitch:number;hp:number;stamina:number;phase:typeof phases[number];time:number;attack:AttackKind;stride:number;guard:number;tool:boolean;grounded:boolean;vx:number;vy:number;vz:number}
export interface EnemyFrame {id:number;position:Vec3;yaw:number;hp:number;phase:typeof enemyPhases[number];time:number;attack:AttackKind;stride:number}
export interface GameFrame {westernNpcLife?:WesternNpcLifeState;npcLife?:NpcLifeState|null;animal?:HomesteadAnimalState;version:1;seconds:number;worldHour:number;worldDay:number;host:ActorFrame;guest:CompanionSnapshot|null;focus:number;enemies:EnemyFrame[];arrows:CoreSimulation['arrows'];shots:CoreSimulation['enemyShots'];tells:CoreSimulation['tells']}
const dense=(v:unknown,max:number):v is unknown[]=>Array.isArray(v)&&v.length<=max&&Object.keys(v).length===v.length;
const actorKeys=['position','yaw','pitch','hp','stamina','phase','time','attack','stride','guard','tool','grounded','vx','vy','vz'];
const position=(v:unknown,western=false):v is Vec3=>vector(v)&&number(v.x,western?-128:-80,western?128:80)&&number(v.y,-30,100)&&number(v.z,western?-160:-100,western?100:30);
export function captureActor(p:CoreSimulation['player'],environment?:PlayerEnvironmentState):ActorFrame{return {...(environment?{environment:clonePlayerEnvironmentState(environment)}:{}),position:{...p.position},yaw:p.yaw,pitch:p.pitch,hp:p.hp,stamina:p.stamina,phase:p.phase,time:p.time,attack:p.attack,stride:p.stride,guard:p.guard,tool:p.tool,grounded:p.grounded,vx:p.vx,vy:p.vy,vz:p.vz};}
const projectilePosition=(v:unknown):v is Vec3=>vector(v)&&number(v.x,-256,256)&&number(v.y,-64,256)&&number(v.z,-256,256);
export function validActor(v:unknown,western=false):v is ActorFrame{return record(v)&&(Object.keys(v).length===actorKeys.length||Object.keys(v).length===actorKeys.length+1&&Object.hasOwn(v,'environment'))&&Object.keys(v).every(k=>actorKeys.includes(k)||k==='environment')&&(v.environment===undefined||validPlayerEnvironmentState(v.environment))&&position(v.position,western)&&number(v.yaw)&&number(v.pitch,-Math.PI/2,Math.PI/2)&&number(v.hp,0,500)&&number(v.stamina,0,500)&&phases.includes(v.phase as ActorFrame['phase'])&&number(v.time,0,1e9)&&attacks.includes(String(v.attack))&&number(v.stride,0,1e9)&&number(v.guard,0,1)&&typeof v.tool==='boolean'&&typeof v.grounded==='boolean'&&number(v.vx,-100,100)&&number(v.vy,-100,100)&&number(v.vz,-100,100);}
export function captureGameFrame(sim:CoreSimulation):GameFrame{return {...(sim.western?{westernNpcLife:sim.westNpcs.snapshot()}:{}),npcLife:sim.npc.snapshot(),animal:structuredClone(sim.animal.state),version:1,seconds:sim.seconds,worldHour:sim.worldHour,worldDay:sim.worldDay,host:captureActor(sim.player,sim.environment),guest:sim.companionSnapshot(),focus:sim.focus.value,enemies:sim.enemies.map(e=>({id:e.id,position:{...e.position},yaw:e.yaw,hp:e.hp,phase:e.phase,time:e.time,attack:e.attack,stride:e.stride})),arrows:sim.arrows.map(a=>({...a,position:{...a.position},velocity:{...a.velocity}})),shots:sim.enemyShots.map(a=>({...a,position:{...a.position},velocity:{...a.velocity}})),tells:sim.tells.map(t=>({...t,position:{...t.position}}))};}
export function validGameFrame(value:unknown,roster:number):value is GameFrame{
 const western=roster===22;
 if(!record(value)||value.version!==1||!number(value.seconds,0,1e9)||!number(value.worldHour,0,24)||!integer(value.worldDay,0,1e9)||!validActor(value.host,western)||value.guest!==null&&(!validCompanionSnapshot(value.guest,western)||!validActor(captureActor(value.guest.player),western))||!number(value.focus,0,100)||!dense(value.enemies,roster)||value.enemies.length!==roster)return false;
 if(value.westernNpcLife!==undefined&&(!western||!validWesternNpcLifeState(value.westernNpcLife)))return false;
 if(value.npcLife!==undefined&&value.npcLife!==null&&!validNpcLifeState(value.npcLife))return false;
 if(value.animal!==undefined&&!validHomesteadAnimalState(value.animal))return false;
 if(value.enemies.some((e,i)=>!record(e)||e.id!==i||!position(e.position,western)||!number(e.yaw)||!number(e.hp,0,1000)||!enemyPhases.includes(e.phase as EnemyFrame['phase'])||!number(e.time,0,1e9)||!attacks.includes(String(e.attack))||!number(e.stride,0,1e9)))return false;
 for(const key of ['arrows','shots']){const list=value[key];if(!dense(list,32)||list.some(a=>!record(a)||!projectilePosition(a.position)||!vector(a.velocity)||Math.hypot(a.velocity.x,a.velocity.y,a.velocity.z)>100||!number(a.life,-1,20)||key==='shots'&&(!number(a.damage,0,1000)||!number(a.radius,0,5))))return false;}
 return dense(value.tells,24)&&value.tells.every(t=>record(t)&&position(t.position,western)&&number(t.radius,0,20)&&number(t.remaining,-1,20)&&typeof t.kind==='string'&&t.kind.length<=40);
}
/** Guest-only presentation update. Never ticks physics, harvests, grants rewards or writes a save. */
export function applyGameFrame(sim:CoreSimulation,value:unknown,preserveLocalLook=true):ActorFrame|null{
 if(!validGameFrame(value,sim.enemies.length)||!value.guest)return null;
 const yaw=sim.player.yaw,pitch=sim.player.pitch;Object.assign(sim.player,value.guest.player,{position:{...value.guest.player.position}});const aux=value.guest.aux;sim.environment=clonePlayerEnvironmentState(aux.environment??createPlayerEnvironmentState());sim.selectedElement=aux.selectedElement;sim.buildMode=aux.buildMode;sim.soilFill=aux.soilFill??false;sim.survival.selected=aux.recipe;sim.survival.rotation=aux.rotation;sim.cold=aux.cold;sim.gliding=aux.gliding;sim.grapple=aux.grapple?{...aux.grapple}:null;sim.oxygen=aux.oxygen;sim.swimming=aux.swimming;sim.deathCause=aux.deathCause;sim.campaign.state.shroudSeconds=aux.shroudSeconds;sim.focus.value=value.focus;if(preserveLocalLook){sim.player.yaw=yaw;sim.player.pitch=pitch;}
 if(value.npcLife!==undefined)sim.npc.restore(value.npcLife);
 if(value.westernNpcLife){sim.westNpcs.restore(value.westernNpcLife);for(const actor of sim.westNpcs.actors)if(actor.state)sim.arena.field.removeObject(actor.profile.id);}
 if(value.animal)sim.home.state.animal.physical=structuredClone(value.animal);sim.seconds=value.seconds;sim.worldHour=value.worldHour;sim.worldDay=value.worldDay;
 for(let i=0;i<sim.enemies.length;i++){const e=value.enemies[i];Object.assign(sim.enemies[i],{id:e.id,position:{...e.position},yaw:e.yaw,hp:e.hp,phase:e.phase,time:e.time,attack:e.attack,stride:e.stride});}
 sim.arrows.splice(0,sim.arrows.length,...value.arrows.map(a=>({...a,position:{...a.position},velocity:{...a.velocity}})));sim.enemyShots.splice(0,sim.enemyShots.length,...value.shots.map(a=>({...a,position:{...a.position},velocity:{...a.velocity}})));sim.tells.splice(0,sim.tells.length,...value.tells.map(t=>({...t,position:{...t.position}})));
 return {...value.host,position:{...value.host.position},environment:clonePlayerEnvironmentState(value.host.environment??createPlayerEnvironmentState())};
}
