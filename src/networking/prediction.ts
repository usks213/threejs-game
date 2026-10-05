import {foodEffect} from '../content/adventure-food';
import { CharacterMotor } from '../physics/character';
import { attackMovementScale } from '../game/combat/attack';
import type { AttackMotion } from '../game/combat/attack';
import type { GameSimulation } from '../simulation/game-simulation';
import type { PlayerInput, Snapshot } from '../simulation/protocol';
export class Prediction {
 private readonly pending: {sequence:number;input:PlayerInput}[]=[];
 private readonly motor:CharacterMotor;
 private riding = false;
 private attack = 0;
 private guarding = false;
 private dodging = false;
 private motion: AttackMotion | undefined;
 constructor(private readonly sim:GameSimulation){this.motor=new CharacterMotor(sim.world);}
 input(sequence:number,input:PlayerInput):void{
  this.pending.push({sequence,input:{...input}});if(this.pending.length>120)this.pending.shift();this.apply(input);
 }
 reconcile(state:Snapshot):void{
  Object.assign(this.sim.player,state.player);this.motor.reset();
  const snapshot = state.adventure, local = this.sim.adventure.state;
  local.buildings = structuredClone(snapshot.buildings); local.resources = structuredClone(snapshot.resources);
  local.seconds=snapshot.seconds;local.health = snapshot.health; local.stamina = snapshot.stamina; local.chill = snapshot.chill;
  local.inventory = {...snapshot.inventory}; local.equipment = snapshot.equipment;
  if (snapshot.meadows) local.meadows = structuredClone(snapshot.meadows); else delete local.meadows;
  this.sim.adventure.traversal.gliding = snapshot.traversal?.gliding ?? false;
  this.sim.adventure.traversal.climbing = snapshot.traversal?.climbing ?? false;
  this.riding = !!snapshot.skybound?.riding||!!snapshot.companions?.riding;
  if (snapshot.skybound) this.sim.skybound.applyReplica(snapshot.skybound);
  else this.sim.skybound.state.parts = [];
  this.attack = snapshot.attack; this.guarding = snapshot.guarding; this.dodging = snapshot.dodging; this.motion = snapshot.attackMotion ? {...snapshot.attackMotion} : undefined;
  this.sim.fluid.restore(state.fluids);
  while(this.pending.length && this.pending[0].sequence<=(state.ack??0))this.pending.shift();
  for(const command of this.pending)this.apply(command.input);
 }
 /** Local movement costs only. Learning, damage, inventory and physics stay on the authority. */
 private speed(input:PlayerInput, water:number, dt:number):number {
  const s=this.sim.adventure.state,m=s.meadows,moving=!!(input.x||input.z),commitment=this.motion?attackMovementScale(this.motion):this.attack>0?1.8/3.4:1;
  if(!m)return s.health<=0?0:(this.guarding?2:4*commitment)*(1-water*.45)*(s.chill?.65:1);
  if(s.health<=0)return 0;
  const running=!!m.sprinting&&this.attack<=0&&!this.guarding&&!this.dodging;
  let speed=m.sneaking?1.5:3.4;
  if(running&&moving&&s.stamina>1){speed=6;s.stamina=Math.max(0,s.stamina-dt*(foodEffect(s,'endurance')?7:10)*(1-(m.skills.run??0)*.005)*(m.power>0?.4:1));}
  if(moving&&water>.65)s.stamina=Math.max(0,s.stamina-dt*(foodEffect(s,'endurance')?5.6:8)*(1-(m.skills.swim??0)*.005));
  if(m.sneaking&&moving)s.stamina=Math.max(0,s.stamina-dt*3);
  if(m.weight>300)speed=.7;if(this.guarding)speed=Math.min(speed,2);if(this.attack>0)speed=Math.min(speed,3.4*commitment);
  return speed*(m.gear.offhand==='towerShield'?.9:m.gear.offhand==='shield'?.95:1)*(1-water*.4)*(s.chill?.65:1);
 }
 private apply(input:PlayerInput):void{
  // Vehicle position is the authority's seat position, never a locally walking passenger.
  if(this.riding)return;
  const p=this.sim.player,dt=1/30,before=p.y,length=Math.max(1,Math.hypot(input.x,input.z));
  const traversal=this.sim.adventure.traversal.beforeMove(input,dt),water=this.sim.fluid.immersion(p,1.45),speed=traversal.speed*this.speed(input,water,dt);
  const flow=this.sim.fluid.current(p),carry=Math.min(1,water*3),dx=(input.x/length*speed+flow.x*carry+(traversal.wind?.x??0))*dt,dz=(input.z/length*speed+flow.z*carry+(traversal.wind?.z??0))*dt;
  let jump=input.jump;
  if(jump&&p.grounded&&this.sim.adventure.state.meadows){const state=this.sim.adventure.state,m=state.meadows!,cost=10*(1-(m.skills.jump??0)*.005)*(m.power>0?.4:1);jump=state.stamina>=cost;if(jump)state.stamina-=cost;}
  if(!traversal.handled)this.motor.step(p,dx,dz,jump,dt,water);
  this.sim.adventure.collidePlayer(before);this.motor.reconcile(p);
  if((dx||dz)&&!this.guarding&&!this.attack&&!this.dodging)p.heading=Math.atan2(dx,dz);
  this.attack=Math.max(0,this.attack-dt);if(this.motion)this.motion.elapsed=Math.min(this.motion.duration,this.motion.elapsed+dt);
 }
}
