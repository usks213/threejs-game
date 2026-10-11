import {bossPartDefinitions,bossPartHealth,bossPartPosition} from './boss-parts';
import type {Vec3} from '../../world/types';
import type {EnemyState} from '../types';
/** Optional local 5-degree aim magnet. It never changes world time or authority hit rules. */
export function assistRangedAim(origin:Vec3,aim:Vec3,enemies:readonly EnemyState[],blocked:(from:Vec3,to:Vec3)=>boolean):Vec3{
 const length=Math.hypot(aim.x,aim.y,aim.z);if(!Number.isFinite(length)||length<.001)return aim;const direction={x:aim.x/length,y:aim.y/length,z:aim.z/length};let best=Math.cos(5*Math.PI/180),selected:Vec3|undefined;
 for(const enemy of enemies){if(enemy.health<=0||(enemy.tame??0)>=1)continue;const points=[{x:enemy.x,y:enemy.y+(enemy.boss?1.5:.8),z:enemy.z},...bossPartDefinitions(enemy).filter(part=>bossPartHealth(enemy,part)>0).map(part=>bossPartPosition(enemy,part))];for(const point of points){const dx=point.x-origin.x,dy=point.y-origin.y,dz=point.z-origin.z,d=Math.hypot(dx,dy,dz);if(d<1||d>24)continue;const dot=(dx*direction.x+dy*direction.y+dz*direction.z)/d;if(dot>best&&!blocked(origin,point)){best=dot;selected={x:dx/d,y:dy/d,z:dz/d};}}}
 return selected??direction;
}
