import { attackMovementScale } from '../combat/attack';
import type { Adventure } from '../adventure';
import { learn } from './state';
export function movementSpeed(game:Adventure,moving:boolean,water:number,dt:number):number{
 const s=game.state,m=s.meadows,motion=game.attackMotion,commitment=motion?attackMovementScale(motion):game.attack>0?1.8/3.4:1;if(!m)return s.health<=0?0:(game.guarding?2:4*commitment)*(1-water*.45)*(s.chill?.65:1);
 const running=!!m.sprinting&&game.attack<=0&&!game.guarding&&game.dodge<=0;
 m.exerting=moving&&(running||!!m.sneaking||water>.65);if(s.health<=0)return 0;let speed=m.sneaking?1.5:3.4;
 if(running&&moving&&s.stamina>1){speed=6;s.stamina=Math.max(0,s.stamina-dt*10*(1-(m.skills.run??0)*.005)*(m.power>0?.4:1));learn(s,'run',dt*.025);}
 if(moving&&water>.65){s.stamina=Math.max(0,s.stamina-dt*8*(1-(m.skills.swim??0)*.005));learn(s,'swim',dt*.025);if(s.stamina===0)game.hurtPlayer(5,'physical');}
 if(m.sneaking&&moving){s.stamina=Math.max(0,s.stamina-dt*3);learn(s,'sneak',dt*.025);}
 if(m.weight>300)speed=.7;if(game.guarding)speed=Math.min(speed,2);if(game.attack>0)speed=Math.min(speed,3.4*commitment);return speed*(m.gear.offhand==='towerShield'?.9:m.gear.offhand==='shield'?.95:1)*(1-water*.4)*(s.chill?.65:1);
}
export function payJump(game:Adventure,jump:boolean,grounded:boolean):boolean{
 if(!jump||!game.state.meadows||!grounded)return jump;const s=game.state,cost=10*(1-(s.meadows!.skills.jump??0)*.005)*(s.meadows!.power>0?.4:1);if(s.stamina<cost)return false;s.stamina-=cost;learn(s,'jump',.1);return true;
}
