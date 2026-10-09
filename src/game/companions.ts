import type {GameSimulation} from '../simulation/game-simulation';
import type {PlayerInput,PlayerState} from '../simulation/protocol';
import {finiteVec,insideBounds,WORLD,type Vec3} from '../world/types';
import {skyContext} from './skybound/context';
import {local as partLocal} from './skybound/orientation';
import {PART_HALF,type SkyContext} from './skybound/types';
export interface CompanionState {id:number;position:Vec3;heading:number;stamina:number;bond:number;owner?:string;following:boolean;tetherPart?:number}
export interface CompanionSave {version:1;creatures:CompanionState[]}
export interface CompanionSnapshot {creatures:(CompanionState & {rider?:string})[];riding?:number}
export type CompanionAction='companion-feed'|'companion-call'|'companion-ride'|'companion-lead';
export const COMPANION_ACTIONS:readonly CompanionAction[]=['companion-feed','companion-call','companion-ride','companion-lead'];
export const COMPANION_LIMITS={creatures:8,substeps:2,rope:3,breakDistance:7,maxForce:90} as const;
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const copy=(p:Vec3):Vec3=>({x:p.x,y:p.y,z:p.z});
export function validateCompanions(raw:unknown):CompanionSave{
 if(!raw||typeof raw!=='object')throw Error('仲間生物の保存が不正です');const s=raw as CompanionSave;
 if(s.version!==1||!Array.isArray(s.creatures)||s.creatures.length>COMPANION_LIMITS.creatures)throw Error('対応しない仲間生物の保存です');const ids=new Set<number>();
 return {version:1,creatures:s.creatures.map(c=>{if(!c||!Number.isSafeInteger(c.id)||c.id<1||ids.has(c.id)||!c.position||!insideBounds(c.position,WORLD,1)||!finiteVec(c.position)||!Number.isFinite(c.heading)||!Number.isFinite(c.stamina)||c.stamina<0||c.stamina>100||!Number.isInteger(c.bond)||c.bond<0||c.bond>3||typeof c.following!=='boolean'||c.owner!==undefined&&(typeof c.owner!=='string'||! /^[a-zA-Z0-9_-]{1,64}$/.test(c.owner)||['__proto__','constructor','prototype'].includes(c.owner))||c.bond>0&&!c.owner||c.tetherPart!==undefined&&(!Number.isSafeInteger(c.tetherPart)||c.tetherPart<1))throw Error('仲間生物の状態が不正です');ids.add(c.id);return {id:c.id,position:copy(c.position),heading:c.heading,stamina:c.stamina,bond:c.bond,following:c.following,...(c.owner?{owner:c.owner}:{}),...(c.tetherPart?{tetherPart:c.tetherPart}:{})};})};
}
/** Original lantern-backed Lumer: fixed-budget walking and an impulse-based tow rope, not teleportation. */
export class AdventureCompanions {
 readonly state:CompanionSave;
 private readonly riders=new Map<string,number>();
 private readonly safe=new Map<string,Vec3>();
 private readonly driven=new Map<number,number>();
 private readonly fall=new Map<number,number>();
 constructor(private readonly sim:GameSimulation,save?:CompanionSave){this.state=save?validateCompanions(save):{version:1,creatures:sim.world.generator===4?[6,14,20].map((x,i)=>({id:840001+i,position:{x,y:sim.groundAt(x,12)+.02,z:12},heading:0,stamina:100,bond:0,following:false})):[]};}
 save():CompanionSave{return validateCompanions(this.state);}
 isRiding(owner:string):boolean{return this.riders.has(owner);}
 snapshot(owner='host'):CompanionSnapshot{return {creatures:this.state.creatures.map(c=>({...structuredClone(c),rider:[...this.riders].find(([,id])=>id===c.id)?.[0]})),riding:this.riders.get(owner)};}
 private actor(owner:string){return this.sim.targets.find(t=>t.adventure.owner===owner)??(this.sim.adventure.owner===owner?{player:this.sim.player,adventure:this.sim.adventure}:undefined);}
 private context():SkyContext{return skyContext(this.sim);}
 private pointBlocked(p:Vec3,ctx:SkyContext):boolean{return ctx.solid(p)||!!ctx.occupied?.(p)||this.sim.skybound.state.parts.some(part=>{const local=partLocal(p,part),half=PART_HALF[part.kind];return Math.abs(local.x)<half.x+.05&&Math.abs(local.y)<half.y+.05&&Math.abs(local.z)<half.z+.05;});}
 private clear(p:Vec3,radius:number,height:number,ctx:SkyContext):boolean{
  if(!insideBounds({...p,y:p.y+height},this.sim.world.bounds,.1))return false;
  for(const y of [.15,height*.5,height])for(const [x,z]of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]])if(this.pointBlocked({x:p.x+x,y:p.y+y,z:p.z+z},ctx))return false;return true;
 }
 private reach(c:CompanionState,player:Vec3,range=3):void{const target={...c.position,y:c.position.y+.7},eye={...player,y:player.y+.8},d=distance(eye,target);if(d>range)throw Error('灯背獣へ近づいてください');const ctx=this.context();for(let t=.15;t<d-.4;t+=.15)if(this.pointBlocked({x:eye.x+(target.x-eye.x)*t/d,y:eye.y+(target.y-eye.y)*t/d,z:eye.z+(target.z-eye.z)*t/d},ctx))throw Error('灯背獣が地形や建物に遮られています');}
 action(owner:string,action:CompanionAction,id:string):{dirty:string[];message:string}{
  if(this.sim.world.generator!==4)throw Error('灯背獣はこの冒険世界の生物です');const actor=this.actor(owner);if(!actor||actor.adventure.state.health<=0)throw Error('動ける冒険者が必要です');const [raw,partRaw]=id.split(':'),c=this.state.creatures.find(c=>c.id===Number(raw));if(!c)throw Error('灯背獣を選んでください');const ok=(message:string)=>({dirty:[],message});
  if(action==='companion-ride'&&this.riders.get(owner)===c.id){this.dismount(owner,actor.player);return ok('灯背獣から降りました');}
  if(action==='companion-lead'&&(!partRaw||partRaw==='off')){if(c.owner!==owner)throw Error('仲間にした冒険者だけが手綱を変更できます');this.detach(c);return ok('手綱を外しました');}
  this.reach(c,actor.player,action==='companion-call'?18:3);
  if(action==='companion-feed'){if(c.owner&&c.owner!==owner)throw Error('別の冒険者の仲間です');if(c.bond>=3)return ok('すでに仲間です');const bag=actor.adventure.state.inventory;if((bag.berry??0)<1)throw Error('仲間になるには木の実を1個ずつ、3回あげてください');bag.berry--;c.owner=owner;c.bond++;return ok(c.bond===3?'灯背獣ルメルが仲間になりました':`木の実をあげました (${c.bond}/3)`);}
  if(c.bond<3||c.owner!==owner)throw Error('まず自分の仲間にしてください');
  if(action==='companion-call'){c.following=!c.following;return ok(c.following?'灯背獣がついてきます':'灯背獣が待ちます');}
  if(action==='companion-ride'){
   if(this.riders.has(owner)||[...this.riders.values()].includes(c.id)||this.sim.skybound.isRiding(owner)||actor.adventure.state.meadows?.riding)throw Error('すでに搭乗中です');
   if([...this.sim.skybound.leases.values()].some(l=>l.owner===owner)||actor.adventure.traversal.snapshot().climbing||actor.adventure.traversal.snapshot().gliding)throw Error('部品操作や登攀・滑空を終えてから乗ってください');
   const seat={...c.position,y:c.position.y+.95};if(!this.clear(seat,.3,1.45,this.context()))throw Error('乗る場所の頭上が塞がれています');this.safe.set(owner,copy(actor.player));this.riders.set(owner,c.id);c.following=false;Object.assign(actor.player,seat,{vy:0,grounded:true});return ok('灯背獣に乗りました。移動入力で歩きます');
  }
  if(action==='companion-lead'){
   const partId=Number(partRaw);if(!Number.isSafeInteger(partId)||partId<1)throw Error('手綱を結ぶ部品を選んでください');const parts=this.sim.skybound.towParts(owner,partId),root=parts.find(p=>p.id===partId)!;if(distance(root.position,c.position)>4||distance(root.position,actor.player)>5)throw Error('灯背獣と部品を近づけてください');
   const ctx=this.context(),d=distance(root.position,{...c.position,y:c.position.y+.6});for(let t=.2;t<d-.6;t+=.2)if(ctx.solid({x:c.position.x+(root.position.x-c.position.x)*t/d,y:c.position.y+.6+(root.position.y-c.position.y-.6)*t/d,z:c.position.z+(root.position.z-c.position.z)*t/d}))throw Error('手綱の間に壁があります');
   if(this.state.creatures.some(other=>other!==c&&other.owner===owner&&other.tetherPart))throw Error('牽引できる灯背獣は1頭ずつです');this.sim.skybound.setTow(owner,partId);c.tetherPart=partId;return ok('軽い構造物へ手綱を結びました');
  }
  throw Error('未知の仲間操作です');
 }
 private detach(c:CompanionState):void{if(c.owner)this.sim.skybound.setTow(c.owner);delete c.tetherPart;}
 private exit(c:CompanionState,owner:string):Vec3|undefined{
  const ctx=this.context();for(const radius of [1.4,2.2,3.2])for(let i=0;i<12;i++){const x=c.position.x+Math.sin(i*Math.PI/6)*radius,z=c.position.z+Math.cos(i*Math.PI/6)*radius,y=this.sim.groundAt(x,z,c.position.y);const p={x,y:y+.03,z};if(Math.abs(y-c.position.y)>2||!this.clear(p,.3,1.45,ctx)||ctx.actors.some(a=>a.id!==owner&&distance(a.position,p)<.7)||this.state.creatures.some(other=>distance(other.position,p)<1))continue;return p;}
  const safe=this.safe.get(owner);if(safe&&this.clear(safe,.3,1.45,ctx))return copy(safe);return undefined;
 }
 private dismount(owner:string,player:PlayerState,forced=false):void{const c=this.state.creatures.find(c=>c.id===this.riders.get(owner));if(!c)return;let exit=this.exit(c,owner);if(!exit&&forced){const ctx=this.context(),spawn=this.actor(owner)?.adventure.state.spawn??{x:0,y:this.sim.groundAt(0,8),z:8};for(const origin of [spawn,c.position]){for(let y=origin.y+.05;y<this.sim.world.bounds.maxY-2;y+=.5){const candidate={x:origin.x,y,z:origin.z};if(this.clear(candidate,.3,1.45,ctx)&&ctx.actors.every(a=>a.id===owner||distance(a.position,candidate)>.7)){exit=candidate;break;}}if(exit)break;}}if(!exit&&!forced)throw Error('降りる場所がありません。開けた場所へ移動してください');if(exit)Object.assign(player,exit);player.vy=0;player.grounded=false;this.riders.delete(owner);this.safe.delete(owner);}
 release(owner:string,player?:PlayerState):void{const actor=this.actor(owner);if(player??actor?.player)this.dismount(owner,(player??actor!.player),true);this.riders.delete(owner);this.safe.delete(owner);for(const c of this.state.creatures)if(c.owner===owner){c.following=false;this.detach(c);}}
 private move(c:CompanionState,x:number,z:number,dt:number,ridden:boolean):void{
  const ctx=this.context(),length=Math.hypot(x,z),speed=c.stamina>0?(ridden?5:3):1.4,scale=Math.max(1,length),moving=length>.01;c.stamina=Math.max(0,Math.min(100,c.stamina+dt*(moving?-5:8)));if(moving)c.heading=Math.atan2(x,z);
  for(let step=0;step<COMPANION_LIMITS.substeps;step++){
   const candidate={x:c.position.x+x/scale*speed*dt/2,y:c.position.y,z:c.position.z+z/scale*speed*dt/2},ground=this.sim.groundAt(candidate.x,candidate.z,c.position.y);
   if(ground-c.position.y>.4||c.position.y-ground>1.1)continue;candidate.y=ground+.02;
   if(this.sim.fluid.immersion(candidate,1.2)>.6||!this.clear(candidate,.55,ridden?2.4:1.35,ctx)||this.state.creatures.some(other=>other!==c&&distance(other.position,candidate)<1.1)||ctx.actors.some(a=>a.id!==this.ridersOwner(c)&&distance(a.position,candidate)<.9))continue;c.position=candidate;
  }
  const ground=this.sim.groundAt(c.position.x,c.position.z,c.position.y);if(ground<c.position.y-.2){const vy=(this.fall.get(c.id)??0)-9.8*dt;this.fall.set(c.id,vy);c.position.y=Math.max(ground+.02,c.position.y+vy*dt);}else this.fall.delete(c.id);
 }
 private ridersOwner(c:CompanionState):string|undefined{return [...this.riders].find(([,id])=>id===c.id)?.[0];}
 drive(owner:string,input:PlayerInput,player:PlayerState):boolean{
  const c=this.state.creatures.find(c=>c.id===this.riders.get(owner));if(!c)return false;const actor=this.actor(owner);if(!actor||actor.adventure.state.health<=0){this.release(owner,player);return false;}
  if(this.driven.get(c.id)!==this.sim.tick){this.driven.set(c.id,this.sim.tick);this.move(c,input.x,input.z,1/30,true);}const seat={...c.position,y:c.position.y+.95};if(!this.clear(seat,.3,1.45,this.context())){this.release(owner,player);return false;}Object.assign(player,seat,{heading:c.heading,vy:0,grounded:true});return true;
 }
 step(dt:number):void{
  if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,1/15);
  for(const c of this.state.creatures){const actor=c.owner?this.actor(c.owner):undefined,rider=this.ridersOwner(c);if(c.owner&&!actor){c.following=false;this.detach(c);continue;}
   if(!rider){let x=0,z=0;if(c.following&&actor&&distance(c.position,actor.player)>2){x=actor.player.x-c.position.x;z=actor.player.z-c.position.z;}this.move(c,x,z,dt,false);}
   if(c.tetherPart&&c.owner){try{const parts=this.sim.skybound.towParts(c.owner,c.tetherPart),root=parts.find(p=>p.id===c.tetherPart)!;this.sim.skybound.setTow(c.owner,c.tetherPart);const anchor={...c.position,y:c.position.y+.65},d=distance(anchor,root.position);if(d>COMPANION_LIMITS.breakDistance)throw Error('手綱が離れすぎました');const ctx=this.context();for(let t=.25;t<d-.6;t+=.25)if(ctx.solid({x:anchor.x+(root.position.x-anchor.x)*t/d,y:anchor.y+(root.position.y-anchor.y)*t/d,z:anchor.z+(root.position.z-anchor.z)*t/d}))throw Error('手綱が壁に遮られました');if(d>COMPANION_LIMITS.rope){const impulse=Math.min(COMPANION_LIMITS.maxForce,(d-COMPANION_LIMITS.rope)*35)*dt;this.sim.skybound.applyImpulse(root.id,{x:(anchor.x-root.position.x)/d*impulse,y:(anchor.y-root.position.y)/d*impulse,z:(anchor.z-root.position.z)/d*impulse},root.position);c.stamina=Math.max(0,c.stamina-dt*3);}}catch{this.detach(c);}}
  }
 }
}
