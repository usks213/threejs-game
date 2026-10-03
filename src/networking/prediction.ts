import { CharacterMotor } from '../physics/character';
import type { GameSimulation } from '../simulation/game-simulation';
import type { PlayerInput, Snapshot } from '../simulation/protocol';
export class Prediction {
 private readonly pending: {sequence:number;input:PlayerInput}[]=[];
 private readonly motor:CharacterMotor;
 constructor(private readonly sim:GameSimulation){this.motor=new CharacterMotor(sim.world);}
 input(sequence:number,input:PlayerInput):void{
  this.pending.push({sequence,input:{...input}});if(this.pending.length>120)this.pending.shift();this.apply(input);
 }
 reconcile(state:Snapshot):void{
  Object.assign(this.sim.player,state.player);this.motor.reset();
  this.sim.adventure.state.buildings=state.adventure.buildings;this.sim.adventure.state.resources=state.adventure.resources;
  this.sim.adventure.state.health=state.adventure.health;this.sim.adventure.state.chill=state.adventure.chill;
  this.sim.fluid.restore(state.fluids);
  while(this.pending.length && this.pending[0].sequence<=(state.ack??0))this.pending.shift();
  for(const command of this.pending)this.apply(command.input);
 }
 private apply(input:PlayerInput):void{
  const p=this.sim.player,length=Math.max(1,Math.hypot(input.x,input.z)),water=this.sim.fluid.immersion(p,1.45),speed=this.sim.adventure.state.health<=0?0:4*(1-water*0.45)*(this.sim.adventure.state.chill?0.65:1);
  const dx=input.x/length*speed/30,dz=input.z/length*speed/30,before=p.y;
  this.motor.step(p,dx,dz,input.jump,1/30,water);this.sim.adventure.collidePlayer(before);this.motor.reconcile(p);
  if(dx||dz)p.heading=Math.atan2(dx,dz);
 }
}
