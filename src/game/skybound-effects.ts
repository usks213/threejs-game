import type { GameSimulation } from '../simulation/game-simulation';
import type { SkyEffect } from './skybound/types';
import { skyContext } from './skybound/context';
/** Effects are consumed once by the room tick. Players are never damage targets. */
export function applySkyEffects(sim:GameSimulation,effects:readonly SkyEffect[]):void{
 const solid=skyContext(sim).solid;
 for(const effect of effects){
  const length=Math.hypot(effect.direction.x,effect.direction.y,effect.direction.z);if((effect.range>0&&length<.5)||!Number.isFinite(effect.damage)||effect.damage<=0)continue;
  const direction={x:effect.direction.x/(length||1),y:effect.direction.y/(length||1),z:effect.direction.z/(length||1)};
  const owner=sim.targets.find(t=>t.adventure.owner===effect.owner)?.adventure??sim.adventure;
  for(const enemy of sim.adventure.state.enemies){
   if(enemy.health<=0)continue;
   const dx=enemy.x-effect.origin.x,dy=enemy.y+.7-effect.origin.y,dz=enemy.z-effect.origin.z;let along=dx*direction.x+dy*direction.y+dz*direction.z;
   if(effect.range===0){along=Math.hypot(dx,dy,dz);if(along>effect.radius+.6)continue;direction.x=dx/(along||1);direction.y=dy/(along||1);direction.z=dz/(along||1);}
   if(effect.range>0&&(along<0||along>effect.range||Math.hypot(dx-direction.x*along,dy-direction.y*along,dz-direction.z*along)>effect.radius+.6))continue;
   let blocked=false;for(let d=.2;d<along-.2;d+=.2){if(solid({x:effect.origin.x+direction.x*d,y:effect.origin.y+direction.y*d,z:effect.origin.z+direction.z*d})){blocked=true;break;}}
   if(blocked)continue;owner.hit(enemy,effect.damage,effect.element,false);
   if(effect.element==='fire')enemy.burn=Math.max(enemy.burn??0,3);if(effect.element==='frost')enemy.slow=Math.max(enemy.slow,3);if(effect.element==='shock')enemy.stagger=Math.max(enemy.stagger??0,.8);
  }
 }
}
