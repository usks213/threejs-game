import type { Adventure } from '../adventure';
/** Host simulation, independent of rendering. Fish stay in connected wet cells and react to swimmers. */
export function stepFish(game:Adventure,dt:number):void {
 const s=game.state,sim=game.sim;
 for(const fish of s.resources){
  if(!['perch','pike'].includes(fish.kind)||fish.ready>s.seconds)continue;
  fish.swimming??={homeX:fish.x,homeZ:fish.z,heading:fish.id*2.399};
  const motion=fish.swimming,top=sim.fluid.surfaceHeight(fish.x,fish.z),ground=sim.groundAt(fish.x,fish.z);
  if(top===null||top-ground<.15){fish.y=ground+.08;continue;}
  if(s.meadows?.fishing?.fish===fish.id){fish.y=top-.2;continue;}
  const p=sim.player,d=Math.hypot(p.x-fish.x,p.z-fish.z),alarmed=d<3&&p.y<top;
  const angle=alarmed?Math.atan2(fish.x-p.x,fish.z-p.z):Math.atan2(motion.homeX+Math.sin(s.seconds*.13+fish.id)*2-fish.x,motion.homeZ+Math.cos(s.seconds*.13+fish.id)*2-fish.z);
  const turn=Math.atan2(Math.sin(angle-motion.heading),Math.cos(angle-motion.heading));motion.heading+=Math.max(-dt*2,Math.min(dt*2,turn));
  const speed=alarmed?2.2:fish.kind==='pike'?.6:.4,nx=fish.x+Math.sin(motion.heading)*speed*dt,nz=fish.z+Math.cos(motion.heading)*speed*dt,next=sim.fluid.surfaceHeight(nx,nz);
  if(next!==null&&next-sim.groundAt(nx,nz)>.25){fish.x=nx;fish.z=nz;fish.y=Math.max(ground+.12,next-.25-Math.sin(s.seconds*.6+fish.id)**2*.2);}else motion.heading+=dt*4;
 }
}
