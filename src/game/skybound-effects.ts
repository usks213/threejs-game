import type { GameSimulation } from '../simulation/game-simulation';
import type { SkyEffect } from './skybound/types';
import { skyContext } from './skybound/context';
import { enemyRayContact } from './combat/enemy-contact';
import { bossPartDefinitions, bossPartHealth, bossPartPosition } from './combat/boss-parts';
/** Effects are consumed once by the room tick. Players are never damage targets. */
export function applySkyEffects(sim:GameSimulation,effects:readonly SkyEffect[]):void{
 const solid=skyContext(sim).solid;
 for(const effect of effects){
  const length=Math.hypot(effect.direction.x,effect.direction.y,effect.direction.z);if((effect.range>0&&length<.5)||!Number.isFinite(effect.damage)||effect.damage<=0)continue;
  const direction={x:effect.direction.x/(length||1),y:effect.direction.y/(length||1),z:effect.direction.z/(length||1)};
  const owner=sim.targets.find(t=>t.adventure.owner===effect.owner)?.adventure??sim.adventure;
  for(const enemy of sim.adventure.state.enemies){
   if(enemy.health<=0)continue;
   let contact;
   if(effect.range>0)contact=enemyRayContact(enemy,effect.origin,direction,effect.range,effect.radius);
   else {
    const candidates=[{point:{x:enemy.x,y:enemy.y+.7,z:enemy.z},radius:.6},...bossPartDefinitions(enemy).filter(p=>bossPartHealth(enemy,p)>0).map(p=>({point:bossPartPosition(enemy,p),radius:p.radius}))];
    const nearest=candidates.map(c=>({...c,distance:Math.hypot(c.point.x-effect.origin.x,c.point.y-effect.origin.y,c.point.z-effect.origin.z)})).filter(c=>c.distance<=effect.radius+c.radius).sort((a,b)=>a.distance-b.distance)[0];
    if(nearest)contact={point:nearest.point,distance:nearest.distance};
   }
   if(!contact)continue;
   const dx=contact.point.x-effect.origin.x,dy=contact.point.y-effect.origin.y,dz=contact.point.z-effect.origin.z,d=Math.hypot(dx,dy,dz);
   let blocked=false;for(let step=.2;step<d-.2;step+=.2){if(solid({x:effect.origin.x+dx*step/d,y:effect.origin.y+dy*step/d,z:effect.origin.z+dz*step/d})){blocked=true;break;}}
   if(blocked)continue;owner.hit(enemy,effect.damage,effect.element,false,effect.origin,contact.point);
   if(effect.element==='fire')enemy.burn=Math.max(enemy.burn??0,3);if(effect.element==='frost')enemy.slow=Math.max(enemy.slow,3);if(effect.element==='shock')enemy.stagger=Math.max(enemy.stagger??0,.8);
  }
 }
}
