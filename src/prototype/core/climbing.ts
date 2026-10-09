import type {Vec3,VoxelField} from './voxel';
import type {SurvivalSystem} from './survival';
export interface ClimbingActor {position:Vec3;vx:number;vy:number;vz:number;hp:number;stamina:number;phase:string;grounded:boolean;impact?:number}
/** Per-actor transient traversal. Saves keep the actual position; reload releases
 * the grip and ordinary gravity applies. No inventory or world cells are created. */
export class LadderTraversal {
 private grips=new WeakMap<ClimbingActor,string>();
 constructor(private survival:SurvivalSystem,private field:VoxelField){}
 active(actor:ClimbingActor){return this.grips.has(actor);}
 release(actor:ClimbingActor){return this.grips.delete(actor);}
 clear(){this.grips=new WeakMap();}
 private surface(id:string,actor:ClimbingActor){const ladder=this.survival.ladder(id);if(!ladder)return null;const c=[1,0,-1,0][ladder.rotation],s=[0,1,0,-1][ladder.rotation],dx=actor.position.x-ladder.position.x,dz=actor.position.z-ladder.position.z;
  const across=c*dx+s*dz,normal=-s*dx+c*dz;
  if(Math.abs(across)>.62||Math.abs(normal)<.44||Math.abs(normal)>1||actor.position.y<ladder.position.y-.2||actor.position.y>ladder.position.y+ladder.height+.1)return null;return ladder;}
 start(id:string,actor:ClimbingActor){if(actor.hp<=0||actor.phase!=='idle'||actor.stamina<2||!this.surface(id,actor)||this.field.overlaps(actor.position))return false;this.grips.set(actor,id);actor.vx=actor.vy=actor.vz=0;actor.grounded=false;return true;}
 step(actor:ClimbingActor,vertical:number,lateral:number,dt:number,bodies:readonly Vec3[]=[]){
  const id=this.grips.get(actor);if(!id)return false;const ladder=this.surface(id,actor);
  if(!ladder||actor.hp<=0||actor.phase!=='idle'||(actor.impact??0)>.65||actor.stamina<=0||Math.abs(lateral)>.35||!Number.isFinite(dt)||dt<=0){this.release(actor);return false;}
  const input=Math.max(-1,Math.min(1,Number.isFinite(vertical)?vertical:0)),step=Math.min(.1,dt),next=Math.max(ladder.position.y+.025,Math.min(ladder.position.y+ladder.height,actor.position.y+input*1.2*step)),delta=next-actor.position.y;
  // Swept capsule in small steps; ceilings, terrain and the other player block.
  const count=Math.max(1,Math.ceil(Math.abs(delta)/.05));for(let i=0;i<count;i++){const p={...actor.position,y:actor.position.y+delta/count};if(this.field.overlaps(p)||bodies.some(b=>b!==actor.position&&Math.abs(b.y-p.y)<1.65&&Math.hypot(b.x-p.x,b.z-p.z)<.55))break;actor.position.y=p.y;actor.stamina=Math.max(0,actor.stamina-Math.abs(delta/count)*(input>0?10:2.5));}
  actor.vx=actor.vy=actor.vz=0;actor.grounded=false;
  if(input<0&&actor.position.y<=ladder.position.y+.04){this.release(actor);return false;}return true;
 }
}
