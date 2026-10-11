import type {JourneyGoal} from '../game/journey';
import type {Vec3} from '../world/types';

/** Legacy horizontal-only targets stay valid; authored heights use full range. */
export function journeyDistance(target:JourneyGoal['target'],player:Vec3):string {
 if(!target)return '';
 const dy=target.y===undefined?0:target.y-player.y;
 const distance=Math.round(Math.hypot(target.x-player.x,dy,target.z-player.z));
 return `${distance}m`;
}

/** Height stays visible inside the hint even when compact layouts hide the kicker. */
export function journeyHint(goal:JourneyGoal,player:Vec3):string {
 const dy=goal.target?.y===undefined?0:goal.target.y-player.y;
 const vertical=Math.abs(dy)>=2?`${dy>0?'上':'下'}${Math.round(Math.abs(dy))}m · `:'';
 return vertical+goal.detail;
}
